/**
 * A point in the circuit where parts meet. Every wire touching a node shares
 * one voltage.
 */
export type Node = number & { readonly __brand: 'Node' };

/** The reference point every voltage is measured from. 0 V by definition. */
export const GROUND = 0 as Node;

/** A handle to a voltage source's current, returned by `Stamp.voltageSource`. */
export type Branch = number & { readonly __brand: 'Branch' };

/** Room temperature, °C. Parts cool toward this. */
export const AMBIENT_CELSIUS = 25;

/**
 * Thermal voltage, in volts: how much push the warmth of a room alone gives an
 * electron. It sets how steeply a diode's current climbs as the voltage rises.
 * Nobody memorizes it; like every number on a datasheet, you look it up.
 * (For the curious: Boltzmann's constant × temperature ÷ the electron's charge.)
 */
export const THERMAL_VOLTAGE = 0.025852;

/**
 * How a nonlinear two-terminal part (a diode, an LED) relates voltage to
 * current.
 */
export interface Curve {
  /** Amps flowing anode → cathode when `volts` sit across the part. */
  current(volts: number): number;
  /**
   * The derivative of `current` at `volts`, in amps per volt. The solver uses
   * it to aim its next guess, so a wrong slope stops the circuit settling.
   */
  slope(volts: number): number;
}

/**
 * What a part uses to describe its electrical behaviour. The solver calls
 * `Part.stamp` with one of these on every guess it makes.
 */
export interface Stamp {
  /** Seconds since the circuit started. */
  readonly time: number;
  /**
   * Seconds this solve moves time forward: one tick. A part whose behaviour
   * depends on time (a capacitor) needs it. A solve that doesn't move time on,
   * straight after an edit, still answers for one tick: what the circuit
   * would look like a moment from now.
   */
  readonly dt: number;
  /** Temperature of the air around the circuit, °C. */
  readonly ambient: number;
  /**
   * A node private to this part, for a point inside it (between an LED's
   * junction and its series resistance, say). The same name always gives the
   * same node.
   */
  internal(name: string): Node;
  /**
   * A path between `a` and `b` that passes current in proportion to the
   * voltage across it: amps = siemens × volts. Conductance is 1 / ohms.
   */
  conductance(a: Node, b: Node, siemens: number): void;
  /** Pushes a fixed current out of `from`, through the part, into `to`. */
  currentSource(from: Node, to: Node, amps: number): void;
  /** Holds `plus` exactly `volts` above `minus`, whatever current that takes. */
  voltageSource(plus: Node, minus: Node, volts: number): Branch;
  /** A part whose current isn't proportional to its voltage. */
  junction(anode: Node, cathode: Node, curve: Curve): void;
  /**
   * A current from `from` to `to`, set by the voltage between two other nodes:
   * amps = curve.current(volts at `plus` − volts at `minus`). Nothing flows
   * between `plus` and `minus` themselves; they only steer it. It's how a
   * transistor works: the voltage across its base and emitter sets the current
   * from its collector to its emitter.
   */
  controlledCurrent(from: Node, to: Node, plus: Node, minus: Node, curve: Curve): void;
}

/** The circuit as it stands once the solver has settled. */
export interface Readings {
  /** Seconds since the circuit started. */
  readonly time: number;
  /**
   * Seconds this solve moves time forward: one tick. A part whose behaviour
   * depends on time (a capacitor) needs it. A solve that doesn't move time on,
   * straight after an edit, still answers for one tick: what the circuit
   * would look like a moment from now.
   */
  readonly dt: number;
  /** Temperature of the air around the circuit, °C. */
  readonly ambient: number;
  /** Volts at `node`, measured from ground. */
  voltage(node: Node): number;
  /** Volts at `a` minus volts at `b`: what a meter shows with red on `a`. */
  across(a: Node, b: Node): number;
  /** Amps a voltage source pushes out of its plus terminal. */
  branchCurrent(branch: Branch): number;
}

/** Anything you can put in a circuit. */
export interface Part {
  /** Short label, like "R1" or "D1". */
  readonly name: string;
  /** Describe how you behave. Called on every guess, so keep it quick. */
  stamp(s: Stamp): void;
  /** Amps through you, in the direction you normally carry current. */
  current(r: Readings): number;
  /**
   * Optional: react to `dt` seconds passing (heat up, wear out). Only called
   * after the solver has settled, so the readings can be trusted.
   */
  settle?(r: Readings, dt: number): void;
}

/** The three things a part does, by method name. */
export type Method = 'stamp' | 'current' | 'settle';

/** A part method that hasn't been written yet. */
export interface Unwritten {
  readonly part: string;
  readonly method: Method;
  /** Where to write it. */
  readonly file: string;
}

/** Raised when a part's own code fails, naming the part and the method. */
export class PartFailed extends Error {
  constructor(
    readonly part: string,
    readonly method: Method,
    readonly reason: string,
  ) {
    super(`${part}.${method}() failed: ${reason}`);
    this.name = 'PartFailed';
  }
}

/** Thrown by a part whose model hasn't been written yet. */
export class NotWrittenYet extends Error {
  constructor(
    readonly part: string,
    readonly file: string,
  ) {
    super(`${part} isn't written yet: open ${file}`);
    this.name = 'NotWrittenYet';
  }
}
