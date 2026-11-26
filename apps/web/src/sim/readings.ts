/**
 * What the board reads, as plain data: every part's current, voltage and state, every wire's current, and the
 * program's. The Inspector, the Graph, the lessons and the 3D view all draw from this.
 */
import type { ChannelInputs, FloatingRead, GpioMode, Level, Outputs, Unwritten } from '@bench/engine';
import type { PinRef } from '../builder/board';

export interface PartReading {
  /**
   * Amps through it, in its own direction: out of a battery's plus, into a
   * resistor's left pin, anode to cathode in an LED, into ground. Undefined
   * while its model isn't written.
   */
  readonly amps: number | undefined;
  /** Volts across it, first pin minus second (0 for ground). */
  readonly volts: number;
  /** Watts it turns into heat or light; negative when it supplies power. */
  readonly watts: number;
  /** Its temperature, °C, for parts that heat up. */
  readonly celsius: number | undefined;
  readonly burnt: boolean;
  /**
   * Past what its datasheet allows: an LED over its rated current, a resistor
   * over its rated temperature, a switch carrying more than its contacts are rated for.
   */
  readonly over: boolean;
  /** For a push button: whether it's held down right now. */
  readonly closed: boolean | undefined;
  /** For a knob: its two legs and the current along each. */
  readonly knob: KnobReading | undefined;
  /** For a capacitor: the charge it's holding. */
  readonly capacitor: CapacitorReading | undefined;
  /** For a transistor: the current into its base, and what that lets through. */
  readonly transistor: TransistorReading | undefined;
  /** For a motor: how fast it turns, and what it pushes back with. */
  readonly motor: MotorReading | undefined;
  /** For a motor driver: how it's powered, and what each channel does. */
  readonly driver: DriverReading | undefined;
  /** For an ESP32 board: each GPIO pin. */
  readonly chip: ChipReading | undefined;
  /** For an LED: how many times it's come on since it was placed (or the board was loaded). */
  readonly flips: number | undefined;
  /** For an LED: seconds it's been glowing without a break (at least the faintest current its datasheet plots). */
  readonly glowing: number | undefined;
  /** For a glowing LED: the most current it's carried since it started glowing, A. */
  readonly peakAmps: number | undefined;
  /**
   * For an LED: its current as an eye sees its light, A, which is what its glow shows. A program can switch it faster
   * than an eye can follow, and then it looks dimmer and steady, at its average (see the engine's seen.ts).
   */
  readonly glowAmps: number | undefined;
  /** False while its stamp() isn't written, so it isn't in the circuit. */
  readonly written: boolean;
}

export interface KnobReading {
  /** Ohms from pin 1 to the wiper, and from the wiper to pin 3. */
  readonly legs: readonly [number, number];
  /** Volts from pin 1 to the wiper, and from the wiper to pin 3. */
  readonly volts: readonly [number, number];
  /** Amps out of the wiper: what's come in along both legs together. */
  readonly wiperAmps: number;
}

export interface CapacitorReading {
  /** Volts it's holding, plus to minus: what its plates were charged to at the end of the last tick. */
  readonly held: number;
  readonly farads: number;
  readonly ratedVolts: number;
  /** Charged the wrong way round: minus above plus. */
  readonly reversed: boolean;
  /** How fast its voltage is changing, V/s, over the last half second: undefined until it has that much history. */
  readonly rising: number | undefined;
}

/** One GPIO pin of an ESP32, as it is right now. */
export interface ChipPin {
  readonly gpio: number;
  readonly mode: GpioMode;
  /** While it's an output: driving HIGH. */
  readonly high: boolean;
  /** What it reads, by your pin's read(); undefined while that isn't written. */
  readonly level: Level | undefined;
  /** Volts against the board's GND. */
  readonly volts: number;
  /** Amps out of the pin, by your pin's current(); undefined while that isn't written. */
  readonly amps: number | undefined;
  /** How many times it's gone between HIGH and LOW while reading (an input, with or without a pull). */
  readonly changes: number;
  /** For a pin analogRead() can read: the lowest and highest it's read since the board was loaded. */
  readonly analogRange: readonly [number, number] | undefined;
  /** For a pin analogRead() can read: what it would give right now. */
  readonly analog: number | undefined;
  /**
   * Nothing holds it: its leak (up to 50 nA, either way) through the resistance it sees could move it further than the
   * whole supply. Its voltage then means nothing, so it isn't shown.
   */
  readonly floating: boolean;
}

export interface ChipReading {
  /** By pin id ("gpio4"). */
  readonly pins: Readonly<Record<string, ChipPin>>;
  /** Amps out of the 3V3 supply into everything the chip powers. */
  readonly supplyAmps: number;
  /** What the Inspector shows while a program runs: the pins as a multimeter would read them (see READOUT_SECONDS). */
  readonly readout: ChipReadout | undefined;
}

/** A pin as the Inspector shows it: as it was at the last readout, its volts and amps averaged since the one before. */
export interface ReadoutPin extends ChipPin {
  /** The share of that time it spent driving HIGH, 0 to 1. */
  readonly highShare: number;
  /** How many times it went between driving HIGH and not, in that time. */
  readonly switches: number;
}

export interface ChipReadout {
  readonly pins: Readonly<Record<string, ReadoutPin>>;
  readonly supplyAmps: number;
}

/**
 * What the Inspector shows while a program is switching pins: every part's current, voltage and power, every wire's
 * current and every pin's voltage, each its average over the last READOUT_SECONDS (see readout.ts).
 */
export interface MeterReadout {
  /** By part id; a part whose current() isn't written isn't in it. */
  readonly parts: Readonly<Record<string, { readonly amps: number; readonly volts: number; readonly watts: number }>>;
  /** Each wire's average current, by wire id. */
  readonly wires: Readonly<Record<string, number>>;
  /** Each pin's average volts, by "partId.pinId". */
  readonly pins: Readonly<Record<string, number>>;
}

/** The program on the board's ESP32: what it's printed, and whether it's running. */
export interface ProgramReading {
  /** The ESP32's part id. */
  readonly chip: string;
  readonly serial: string;
  /** Why it stopped, once it has: a mistake in it, or it got stuck. */
  readonly failure: string | undefined;
  /** Each time it read a pin that could have gone either way. */
  readonly floating: readonly FloatingRead[];
  /** False while your pin model isn't written, so the program can't run yet. */
  readonly runs: boolean;
  /** The pins it has read with analogRead(). */
  readonly analogPins: ReadonlySet<number>;
}

/** What a transistor is doing: nothing, amplifying, or switched fully on. */
export type TransistorState = 'off' | 'amplifying' | 'on';

export interface TransistorReading {
  /** Amps into the base. */
  readonly baseAmps: number;
  /** Amps in at the collector: the part's own current, so undefined while its current() isn't written. */
  readonly collectorAmps: number | undefined;
  /** Volts collector to emitter, and base to emitter. */
  readonly collectorVolts: number;
  readonly baseVolts: number;
  /** Undefined while there's no collector current to judge it by. */
  readonly state: TransistorState | undefined;
  /**
   * The highest volts collector to emitter in the last second, however briefly: a coil switched off kicks it up for
   * far less than a tick. Undefined for code that doesn't keep it.
   */
  readonly highestVolts: number | undefined;
}

/** What a motor driver's channel does to a motor across it, from its two outputs. */
export type DriveMode = 'forward' | 'reverse' | 'brake' | 'coast';

/** One channel of a motor driver. */
export interface ChannelReading {
  /** OUT1's and OUT2's: switched to the motor supply, to ground, or to neither. */
  readonly outputs: Outputs;
  /** What that does to a motor across them. Undefined for a mix the datasheet's table never gives (one output off). */
  readonly mode: DriveMode | undefined;
  /** Out of OUT1, through whatever's across the outputs, and back in at OUT2, A. */
  readonly amps: number;
  /** Its inputs, as the chip last read them. */
  readonly inputs: ChannelInputs;
}

/** A motor driver: how it's powered, and its two channels. */
export interface DriverReading {
  /** Channel A, then B. */
  readonly channels: readonly [ChannelReading, ChannelReading];
  /** True while VCC is high enough for its logic to run. */
  readonly powered: boolean;
  /** True while STBY reads HIGH. */
  readonly awake: boolean;
  /** True while an input sits between LOW and HIGH. */
  readonly uncertain: boolean;
  /** VM, the motor supply, from its GND, V. */
  readonly motorVolts: number;
  /** VCC, the logic supply, from its GND, V. */
  readonly logicVolts: number;
}

export interface MotorReading {
  /** How fast its shaft turns, rpm. */
  readonly rpm: number;
  /** How many turns it's made since it was put on the board. */
  readonly turns: number;
  /** The volts it makes by turning, pushing back against its supply. */
  readonly backEmf: number;
  /** Its speed averaged over the last whole half second, rpm: steady through PWM's ripple. Undefined until there is one. */
  readonly averageRpm: number | undefined;
  /** True once that average holds: within 3 % of the half second before it. A motor still speeding up isn't. */
  readonly steady: boolean;
  /** True while something holds its shaft still. */
  readonly held: boolean;
}

/** A capacitor's voltage over the last little while: what the Graph draws. */
export interface Trace {
  /** Circuit time of each sample, s. */
  readonly times: readonly number[];
  readonly volts: readonly number[];
}

export interface WireReading {
  /** Amps from its first end to its second. */
  readonly amps: number;
  /** How far the flow dots have travelled along it, in drawing units. */
  readonly flow: number;
}

export interface BoardSnapshot {
  readonly time: number;
  /** By part id. A part added this frame has no reading until the next step. */
  readonly parts: Readonly<Partial<Record<string, PartReading>>>;
  readonly wires: Readonly<Partial<Record<string, WireReading>>>;
  /** Volts at each pin ("p3.anode"), measured from ground. */
  readonly pins: Readonly<Partial<Record<string, number>>>;
  /** True when a ground symbol is wired in, so pin voltages mean something on their own. */
  readonly grounded: boolean;
  readonly converged: boolean;
  readonly unsettled: readonly string[];
  readonly notWritten: readonly Unwritten[];
  /** Set when a part threw something other than "not written yet". */
  readonly error: string | undefined;
  /** Seconds since every battery on the board stopped supplying current (unplugged, or switched off). */
  readonly unpowered: number;
  /** The program on each of the board's ESP32s, by the chip's part id. */
  readonly programs: Readonly<Record<string, ProgramReading>>;
  /** The first ESP32's program, if there is one: for anything that only needs one. */
  readonly program: ProgramReading | undefined;
  /** While a program is switching pins, what the Inspector shows: everything averaged as a meter would. */
  readonly readout: MeterReadout | undefined;
}

export const pinKey = (ref: PinRef) => `${ref.part}.${ref.pin}`;
