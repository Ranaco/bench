/**
 * Bench's default motor driver: what every TB6612FNG runs once Lesson 8, Direction is finished, and what the tests
 * check the engine and the board against. The learner writes its logic, drive(), in that lesson; theirs is kept, and
 * can be switched to.
 */
import { THERMAL_VOLTAGE, type Curve, type Node, type Part, type Readings, type Stamp } from '../../types';

/** Where an output is switched to: the motor supply (high), ground (low), or neither (off: "high impedance"). */
export type Output = 'high' | 'low' | 'off';

/** One channel's two outputs, OUT1 and OUT2. */
export type Outputs = readonly [Output, Output];

/** One channel's inputs, as the chip last read them: true is HIGH. */
export interface ChannelInputs {
  readonly in1: boolean;
  readonly in2: boolean;
  readonly pwm: boolean;
}

/** One channel's pins: its three inputs and its two outputs. */
export interface ChannelPins {
  readonly in1: Node;
  readonly in2: Node;
  readonly pwm: Node;
  readonly out1: Node;
  readonly out2: Node;
}

/** The chip's pins. */
export interface DriverPins {
  /** The motor supply: what the outputs switch to. */
  readonly vm: Node;
  /** The logic supply. */
  readonly vcc: Node;
  readonly gnd: Node;
  /** LOW puts the whole chip to sleep. */
  readonly stby: Node;
  readonly a: ChannelPins;
  readonly b: ChannelPins;
}

/** What a motor driver's datasheet says, in SI units. */
export interface DriverSpec {
  /** The logic supply's range, V ("VCC", operating). */
  readonly minLogicVolts: number;
  readonly maxLogicVolts: number;
  /** The motor supply's range, V ("VM", operating). */
  readonly minMotorVolts: number;
  readonly maxMotorVolts: number;
  /** An input counts as HIGH at or above this share of VCC ("VIH")… */
  readonly highShare: number;
  /** …and as LOW at or below this share ("VIL"). Between the two, it can't be sure. */
  readonly lowShare: number;
  /** Each input's own pull-down to GND, Ω. */
  readonly pullDownOhms: number;
  /** What its logic draws from VCC while running, as a resistance, Ω… */
  readonly logicOhms: number;
  /** …and asleep (STBY LOW), Ω. */
  readonly standbyOhms: number;
  /** One output switch, on, Ω. */
  readonly switchOhms: number;
  /** One output switch, off: what it still leaks, Ω. */
  readonly offOhms: number;
  /** The diodes beside each switch: how much they leak before they turn on, A (SPICE "IS")… */
  readonly diodeSaturationAmps: number;
  /** …and how gently their current climbs with voltage (SPICE "N"). */
  readonly diodeIdeality: number;
  /** The most average current per channel, A ("IOUT", absolute maximum). */
  readonly ratedAmps: number;
  /** VCC falling below this switches every output off ("UVLD"), V… */
  readonly lockoutVolts: number;
  /** …until it's back above this ("UVLC"), V. */
  readonly recoverVolts: number;
}

/** The diodes' one point on the datasheet: 1 V across them at 1 A. */
const DIODE_VOLTS = 1;
const DIODE_AMPS = 1;

/**
 * Toshiba TB6612FNG, a driver for two small DC motors, from its datasheet (the 2008-05-09 edition, as Pololu hosts it
 * at www.pololu.com/file/0J86/TB6612FNG.pdf; Toshiba's current reissue is dated 2026-05-13). Page numbers are that
 * edition's. Two numbers are Bench's, not the sheet's, and say so below.
 */
export const TB6612FNG: DriverSpec = {
  // p.3, Operating Range.
  minLogicVolts: 2.7,
  maxLogicVolts: 5.5,
  minMotorVolts: 2.5,
  maxMotorVolts: 13.5,
  // p.5: VIH from VCC × 0.7, VIL up to VCC × 0.3.
  highShare: 0.7,
  lowShare: 0.3,
  // p.2, Pin Functions: "200 kΩ pull-down at internal" on every input.
  pullDownOhms: 200e3,
  // p.5: ICC 1.1 mA typical at VCC = 3 V; at most 1 µA in standby.
  logicOhms: 3 / 1.1e-3,
  standbyOhms: 3 / 1e-6,
  // p.1 and p.5 give the upper and lower switch together, 0.5 Ω typical (0.5 V at 1 A, 0.15 V at 0.3 A). Bench's:
  // split evenly between them.
  switchOhms: 0.25,
  // p.5: output leakage at most 1 µA at 15 V.
  offOhms: 15 / 1e-6,
  // p.5: "Regenerative diode VF" 1 V typical at 1 A, upper and lower. One point can't fix both numbers, so Bench's:
  // the steepest a junction can be (N = 1), and the leak that puts it through that point.
  diodeSaturationAmps: DIODE_AMPS / Math.expm1(DIODE_VOLTS / THERMAL_VOLTAGE),
  diodeIdeality: 1,
  // p.3: 1.2 A average per channel (absolute maximum; 3.2 A for a single 10 ms pulse).
  ratedAmps: 1.2,
  // p.5, Designed values: low voltage detecting 1.9 V, recovering 2.2 V. The sheet doesn't say which supply it
  // watches; Bench takes it to be VCC, the logic's.
  lockoutVolts: 1.9,
  recoverVolts: 2.2,
};

const OFF: Outputs = ['off', 'off'];
const LOW: ChannelInputs = { in1: false, in2: false, pwm: false };
/** Channel A, then B. */
const CHANNELS = [0, 1] as const;

/**
 * Motor driver: four switches per motor, an H-bridge. OUT1 and OUT2 each switch to the motor supply (VM) or to
 * ground, so a motor between them gets the battery either way round, or both its ends on ground (a short brake), or
 * nothing at all (it coasts). Beside each switch, a diode catches the motor's kick when the switches let go.
 *
 * drive() is the chip's logic: which way each output goes, from its pins. Everything else is the physics around it.
 */
export class MotorDriver implements Part {
  /** STBY as last read: HIGH to run. */
  stby = false;
  /** Each channel's inputs as last read: A, then B. */
  inputs: [ChannelInputs, ChannelInputs] = [LOW, LOW];
  /** Each channel's outputs, from the last stamp: A, then B. */
  outputs: [Outputs, Outputs] = [OFF, OFF];
  /** True while VCC is high enough for its logic to run. */
  powered = false;
  /** True while some input sits between LOW and HIGH: the chip keeps what it read there last. */
  uncertain = false;
  private readonly diode: Curve;

  constructor(
    readonly name: string,
    readonly pins: DriverPins,
    readonly spec: DriverSpec = TB6612FNG,
    /** More GND pins, joined to `pins.gnd` on its board. */
    readonly grounds: readonly Node[] = [],
  ) {
    const steepness = spec.diodeIdeality * THERMAL_VOLTAGE;
    this.diode = {
      current: (volts) => spec.diodeSaturationAmps * Math.expm1(volts / steepness),
      slope: (volts) => (spec.diodeSaturationAmps / steepness) * Math.exp(volts / steepness),
    };
  }

  /**
   * The chip's logic, from the datasheet's table (p.4): STBY LOW sleeps; IN1 and IN2 both HIGH brake, both LOW stop;
   * otherwise PWM LOW brakes and PWM HIGH drives, OUT1 HIGH for IN1 (the sheet's "CW"). The table leaves out IN1 and
   * IN2 both LOW with PWM LOW: Bench keeps that stopped too.
   */
  drive(in1: boolean, in2: boolean, pwm: boolean, stby: boolean): Outputs {
    if (!stby) return OFF;
    if (in1 && in2) return ['low', 'low'];
    if (!in1 && !in2) return OFF;
    if (!pwm) return ['low', 'low'];
    return in1 ? ['high', 'low'] : ['low', 'high'];
  }

  stamp(s: Stamp): void {
    const { vcc, gnd, stby, a, b } = this.pins;
    for (const ground of this.grounds) s.voltageSource(ground, gnd, 0);
    for (const input of [stby, a.in1, a.in2, a.pwm, b.in1, b.in2, b.pwm]) s.conductance(input, gnd, 1 / this.spec.pullDownOhms);
    s.conductance(vcc, gnd, 1 / (this.powered && this.stby ? this.spec.logicOhms : this.spec.standbyOhms));
    for (const channel of CHANNELS) {
      const pins = channel === 0 ? a : b;
      const { in1, in2, pwm } = this.inputs[channel];
      // Asked even while it's off, so a drive() still to write keeps the chip out of the circuit.
      const asked = this.drive(in1, in2, pwm, this.stby);
      const outputs = this.powered ? asked : OFF;
      this.outputs[channel] = outputs;
      this.stampOutput(s, pins.out1, outputs[0]);
      this.stampOutput(s, pins.out2, outputs[1]);
    }
  }

  /** One output: a switch up to VM and one down to GND, each with its diode. */
  private stampOutput(s: Stamp, out: Node, output: Output): void {
    s.conductance(this.pins.vm, out, 1 / this.ohms(output, 'high'));
    s.conductance(out, this.pins.gnd, 1 / this.ohms(output, 'low'));
    s.junction(out, this.pins.vm, this.diode); // the upper diode: up from the output to VM
    s.junction(this.pins.gnd, out, this.diode); // the lower diode: up from GND to the output
  }

  /** A switch's resistance: on if the output goes its way, off (its leak) if not. */
  private ohms(output: Output, side: 'high' | 'low'): number {
    return output === side ? this.spec.switchOhms : this.spec.offOhms;
  }

  /** The current in at VM: what the motors draw from their supply, A. */
  current(r: Readings): number {
    const { vm, a, b } = this.pins;
    let amps = 0;
    for (const channel of CHANNELS) {
      const pins = channel === 0 ? a : b;
      const [first, second] = this.outputs[channel];
      for (const [out, output] of [
        [pins.out1, first],
        [pins.out2, second],
      ] as const) {
        amps += r.across(vm, out) / this.ohms(output, 'high') - this.diode.current(r.across(out, vm));
      }
    }
    return amps;
  }

  /** The current out of a channel's OUT1, through whatever is across its outputs, and back in at OUT2, A. */
  loadAmps(r: Readings, channel: 0 | 1): number {
    const { vm, gnd } = this.pins;
    const out = (channel === 0 ? this.pins.a : this.pins.b).out1;
    const output = this.outputs[channel][0];
    return (
      r.across(vm, out) / this.ohms(output, 'high') -
      r.across(out, gnd) / this.ohms(output, 'low') +
      this.diode.current(r.across(gnd, out)) -
      this.diode.current(r.across(out, vm))
    );
  }

  /** Reads its pins, as the chip does: what it decides from them shows from the next step. */
  settle(r: Readings): void {
    const { vcc, gnd, stby, a, b } = this.pins;
    const supply = r.across(vcc, gnd);
    this.powered = supply >= (this.powered ? this.spec.lockoutVolts : this.spec.recoverVolts);
    this.uncertain = false;
    if (!this.powered) {
      this.stby = false;
      this.inputs = [LOW, LOW];
      return;
    }
    const level = (node: Node, was: boolean) => {
      const volts = r.across(node, gnd);
      if (volts >= this.spec.highShare * supply) return true;
      if (volts <= this.spec.lowShare * supply) return false;
      this.uncertain = true;
      return was;
    };
    this.stby = level(stby, this.stby);
    const read = (pins: ChannelPins, was: ChannelInputs): ChannelInputs => ({
      in1: level(pins.in1, was.in1),
      in2: level(pins.in2, was.in2),
      pwm: level(pins.pwm, was.pwm),
    });
    this.inputs = [read(a, this.inputs[0]), read(b, this.inputs[1])];
  }
}
