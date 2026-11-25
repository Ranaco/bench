/**
 * Tests for your motor driver (packages/engine/src/lesson-8-direction/driver.ts). They wait as "todo" until drive()
 * stops throwing NotWrittenYet; then each job's tests check it, in order: job 1's pass once you've written it, job 2's
 * once you've written that too, and so on.
 */
import { describe, expect, it } from 'vitest';
import {
  Battery,
  Circuit,
  ENERGIZER_522,
  FAULHABER_1516_009SR,
  GROUND,
  Motor,
  MotorDriver,
  Resistor,
  TB6612FNG,
  TICK,
  type Code,
  type DriverPins,
  type Node,
  type Part,
  type Readings,
  type Stamp,
} from '../../src/index';
import { expectConserved, isWritten, Source, SpyStamp } from '../fixtures';
import { implementations } from '../implementations';

const SHEET = TB6612FNG;
const MOTOR = FAULHABER_1516_009SR;
/** Radians a second in one rpm. */
const RPM = (2 * Math.PI) / 60;
const HIGH = 3.3;
const LOW = 0;

/** The most `node` gets above `ref` in any step, small ones included: what a kick leaves. */
class Peak implements Part {
  highest = -Infinity;
  constructor(
    readonly name: string,
    readonly node: Node,
    readonly ref: Node,
  ) {}
  stamp(s: Stamp): void {
    s.conductance(this.node, this.ref, 1e-12);
  }
  current(): number {
    return 0;
  }
  settle(r: Readings): void {
    this.highest = Math.max(this.highest, r.across(this.node, this.ref));
  }
}

describe('The TB6612FNG’s datasheet, as Bench reads it', () => {
  it('drops 0.5 V across an upper and a lower switch at 1 A, as the sheet’s Vsat (U+L) says', () => {
    // VM 5 V into 4.5 Ω through OUT1 high and OUT2 low: 1 A if the two switches together are 0.5 Ω.
    const c = new Circuit();
    const pins = wire(c);
    c.add(new Source('VM', pins.vm, GROUND, 5));
    c.add(new Source('VCC', pins.vcc, GROUND, 3.3));
    drive(c, pins, { stby: HIGH, in1: HIGH, in2: LOW, pwm: HIGH });
    c.add(new MotorDriver('U1', pins));
    c.add(new Resistor('R', pins.a.out1, pins.a.out2, 4.5));
    c.step(0.01);
    const load = c.voltage(pins.a.out1) - c.voltage(pins.a.out2);
    expect(Math.abs(load / 4.5 - 1)).toBeLessThan(0.01);
    expect(5 - load).toBeCloseTo(0.5, 2);
  });

  it('has diodes that drop 1 V at 1 A, the sheet’s regenerative diode VF', () => {
    // Everything off, OUT1 pulled 2 V below ground through 1 Ω: the lower diode carries about 1 A.
    const c = new Circuit();
    const pins = wire(c);
    c.add(new Source('VM', pins.vm, GROUND, 5));
    c.add(new Source('VCC', pins.vcc, GROUND, 3.3));
    const under = c.node('under');
    c.add(new Source('V', under, GROUND, -2));
    c.add(new MotorDriver('U1', pins));
    c.add(new Resistor('R', pins.a.out1, under, 1));
    c.step(0.01);
    const across = -c.voltage(pins.a.out1);
    const amps = c.voltage(pins.a.out1) - -2;
    expect(amps).toBeCloseTo(1, 1);
    expect(across - (1 + 0.025852 * Math.log(amps))).toBeCloseTo(0, 3);
  });
});

/** The nodes on every pin of one chip in `c`. */
function wire(c: Circuit): DriverPins {
  const channel = (name: string) => ({
    in1: c.node(`${name}IN1`),
    in2: c.node(`${name}IN2`),
    pwm: c.node(`PWM${name}`),
    out1: c.node(`${name}O1`),
    out2: c.node(`${name}O2`),
  });
  return { vm: c.node('VM'), vcc: c.node('VCC'), gnd: GROUND, stby: c.node('STBY'), a: channel('A'), b: channel('B') };
}

/** Ideal sources on channel A's inputs and STBY, set to `levels`; change them, then call `c.changed()`. */
function drive(c: Circuit, pins: DriverPins, levels: { stby: number; in1: number; in2: number; pwm: number }) {
  return {
    stby: c.add(new Source('STBY', pins.stby, GROUND, levels.stby)),
    in1: c.add(new Source('AIN1', pins.a.in1, GROUND, levels.in1)),
    in2: c.add(new Source('AIN2', pins.a.in2, GROUND, levels.in2)),
    pwm: c.add(new Source('PWMA', pins.a.pwm, GROUND, levels.pwm)),
  };
}

/** The class under test: Bench's default, or yours. */
type DriverClass = Code['driver'];

function suite(Driver: DriverClass, label: string) {
  const written = isWritten(() => {
    const c = new Circuit();
    new Driver('U1', wire(c)).stamp(new SpyStamp());
  });

  /**
   * The 9 V battery on VM, 3.3 V on VCC, the motor across channel A, and sources on A's inputs and STBY, starting
   * at `levels`.
   */
  function rig(levels: { stby: number; in1: number; in2: number; pwm: number }) {
    const c = new Circuit();
    const pins = wire(c);
    c.add(new Battery('B1', pins.vm, GROUND, ENERGIZER_522.volts, ENERGIZER_522.ohms));
    const vcc = c.add(new Source('VCC', pins.vcc, GROUND, 3.3));
    const inputs = drive(c, pins, levels);
    const motor = c.add(new Motor('M1', pins.a.out1, pins.a.out2));
    const chip = c.add(new Driver('U1', pins));
    /** Sets the inputs, as a program writing its pins would. */
    const set = (next: Partial<Record<'stby' | 'in1' | 'in2' | 'pwm', number>>) => {
      for (const [pin, volts] of Object.entries(next)) inputs[pin as keyof typeof inputs].volts = volts;
      c.changed();
    };
    return { c, pins, motor, chip, vcc, set };
  }

  const FORWARD = { stby: HIGH, in1: HIGH, in2: LOW, pwm: HIGH };

  /** Steps until the motor stops (or `most` seconds pass): how long it took. */
  function stopping(c: Circuit, motor: { readonly speed: number }, most = 2) {
    let t = 0;
    while (motor.speed !== 0 && t < most) {
      c.step(TICK);
      t += TICK;
    }
    return t;
  }

  if (!written) {
    it.todo(`Motor driver: drive(), job 1 first (${label})`);
    return;
  }

  describe(`Motor driver, job 1: forward and backwards (${label})`, () => {
    it('turns the motor forward with IN1 HIGH and IN2 LOW, up to speed', () => {
      const { c, motor } = rig(FORWARD);
      c.step(1);
      expect(motor.speed / RPM).toBeGreaterThan(0.75 * MOTOR.noLoadRpm);
      expectConserved(c);
    });

    it('turns it backwards with IN1 LOW and IN2 HIGH', () => {
      const { c, motor } = rig({ ...FORWARD, in1: LOW, in2: HIGH });
      c.step(1);
      expect(motor.speed / RPM).toBeLessThan(-0.75 * MOTOR.noLoadRpm);
    });

    it('puts the whole battery across it, less the switches: 9.35 V ÷ (32.5 + 0.5 + 1.75) Ω held still', () => {
      const { c, motor } = rig(FORWARD);
      motor.held = true;
      c.step(0.05);
      const amps = (c.currentThrough(motor) ?? NaN);
      expect(Math.abs(amps / (ENERGIZER_522.volts / (MOTOR.ohms + 2 * SHEET.switchOhms + ENERGIZER_522.ohms)) - 1)).toBeLessThan(0.01);
    });
  });

  describe(`Motor driver, job 2: two ways to stop (${label})`, () => {
    it('coasts with both inputs LOW: nothing flows, and only friction slows it, over about half a second', () => {
      const { c, motor, set } = rig(FORWARD);
      c.step(1);
      set({ in1: LOW });
      c.step(0.01);
      expect(Math.abs((c.currentThrough(motor) ?? NaN))).toBeLessThan(1e-4);
      const coast = 0.01 + stopping(c, motor);
      expect(coast).toBeGreaterThan(0.3);
    });

    it('brakes with both HIGH: its back-EMF drives current backwards through it, and it stops five times sooner', () => {
      const coasting = rig(FORWARD);
      coasting.c.step(1);
      coasting.set({ in1: LOW });
      const coast = stopping(coasting.c, coasting.motor);

      const braking = rig(FORWARD);
      braking.c.step(1);
      braking.set({ in2: HIGH });
      braking.c.step(TICK);
      expect((braking.c.currentThrough(braking.motor) ?? NaN)).toBeLessThan(-0.1); // backwards, while it still turns forward
      expect(braking.motor.speed).toBeGreaterThan(0);
      const brake = TICK + stopping(braking.c, braking.motor);
      expect(brake * 5).toBeLessThan(coast);
    });
  });

  describe(`Motor driver, job 3: the PWM and STBY pins (${label})`, () => {
    it('brakes when PWM goes LOW, as hard as both inputs HIGH', () => {
      const { c, motor, set } = rig(FORWARD);
      c.step(1);
      set({ pwm: LOW });
      c.step(TICK);
      expect((c.currentThrough(motor) ?? NaN)).toBeLessThan(-0.1);
      expect(stopping(c, motor)).toBeLessThan(0.15);
    });

    it('lets go of everything with STBY LOW: the motor coasts', () => {
      const { c, motor, set, chip } = rig(FORWARD);
      c.step(1);
      set({ stby: LOW });
      c.step(0.01);
      expect(chip.outputs[0]).toEqual(['off', 'off']);
      expect(Math.abs((c.currentThrough(motor) ?? NaN))).toBeLessThan(1e-4);
    });

    it('runs at about half speed on half PWM, braking through each off-time', () => {
      const { c, motor, set } = rig(FORWARD);
      for (let ms = 0; ms < 2000; ms += 5) {
        set({ pwm: Math.floor(ms / 5) % 2 === 0 ? HIGH : LOW });
        c.step(0.005);
      }
      const rpm = motor.speed / RPM;
      expect(rpm).toBeGreaterThan(0.35 * MOTOR.noLoadRpm);
      expect(rpm).toBeLessThan(0.65 * MOTOR.noLoadRpm);
    });
  });

  describe(`Motor driver: Bench's physics around your drive() (${label})`, () => {
    it('catches the motor’s kick in its own diodes: switched off, OUT2 goes no more than a diode above VM', () => {
      // Forward, the winding's current flows out of OUT1 and into OUT2. Let go, it carries on: into OUT2, up
      // through the upper diode to VM, and round through the lower diode into OUT1.
      const { c, pins, motor, set } = rig(FORWARD);
      motor.held = true; // the most current to stop
      const peak = c.add(new Peak('P', pins.a.out2, pins.vm));
      c.step(0.05);
      peak.highest = -Infinity;
      set({ in1: LOW }); // both inputs LOW: every switch lets go
      c.step(TICK);
      expect(peak.highest).toBeGreaterThan(0.5); // it did kick, and a diode took it
      expect(peak.highest).toBeLessThan(1.1); // the sheet's most for its diodes
      expectConserved(c);
    });

    it('switches nothing on until VCC is up, and keeps a level it can’t be sure of', () => {
      const { c, motor, chip, vcc, set } = rig(FORWARD);
      vcc.volts = 1;
      c.changed();
      c.step(0.1);
      expect(chip.powered).toBe(false);
      expect(motor.speed).toBe(0);
      vcc.volts = 3.3;
      c.changed();
      c.step(0.1);
      expect(chip.powered).toBe(true);
      set({ in1: 1.65 }); // half of VCC: neither HIGH nor LOW
      c.step(0.01);
      expect(chip.uncertain).toBe(true);
      expect(chip.inputs[0].in1).toBe(true);
    });
  });
}

describe.each(implementations('driver'))('$label', ({ code, label }) => {
  suite(code, label);
});
