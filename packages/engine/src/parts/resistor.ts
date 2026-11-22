import { ThermalMass } from '../thermal';
import type { Node, Part, Readings, Stamp } from '../types';

/** What a resistor's datasheet says about heat. */
export interface ResistorSpec {
  /** Power it can turn into heat continuously, W. */
  readonly ratedWatts: number;
  /** Degrees hotter per watt once settled (thermal resistance to the air), K/W. */
  readonly kelvinPerWatt: number;
  /** Energy to warm it by one degree, J/K. Sets how fast it heats up. */
  readonly joulesPerKelvin: number;
  /** Hottest it's meant to run, °C. */
  readonly maxCelsius: number;
  /** Where the coating chars and the film breaks, so it fails open, °C. */
  readonly burnCelsius: number;
}

/**
 * A ¼ W carbon film resistor, the kind in every starter kit. The usual rating
 * for these is 0.25 W up to 70 °C, derating to nothing at 155 °C:
 * (155 − 70) / 0.25 = 340 K/W. Those are typical figures, not checked against
 * one datasheet. Heat capacity and burn temperature are estimates.
 */
export const QUARTER_WATT: ResistorSpec = {
  ratedWatts: 0.25,
  kelvinPerWatt: 340,
  joulesPerKelvin: 0.044,
  maxCelsius: 155,
  burnCelsius: 350,
};

/**
 * Resistor: the simplest part, and the pattern every other part follows.
 *
 * Put a voltage across a resistor and current flows in proportion: double the
 * voltage, double the current. That's Ohm's law:
 *
 *     amps = volts / ohms
 *
 * Every part answers the same questions:
 *   stamp(s)        How do you behave? A resistor is a fixed conductance,
 *                   1 / ohms: how easily current gets through.
 *   current(r)      How much current flows through you right now?
 *   settle(r, dt)   React to time passing. Current through a resistance
 *                   makes heat (watts = amps² × ohms), and too much heat
 *                   burns it out.
 */
export class Resistor implements Part {
  /** True once it has overheated and failed open. */
  burnt = false;
  private readonly heat: ThermalMass;

  constructor(
    readonly name: string,
    readonly a: Node,
    readonly b: Node,
    public ohms: number,
    readonly spec: ResistorSpec = QUARTER_WATT,
  ) {
    this.heat = new ThermalMass(spec.kelvinPerWatt, spec.joulesPerKelvin);
  }

  /** Body temperature, °C. */
  get temperature(): number {
    return this.heat.celsius;
  }

  stamp(s: Stamp): void {
    if (!(this.ohms > 0)) {
      throw new RangeError(`a resistor needs more than 0 Ω (got ${String(this.ohms)}); for a plain connection, use a Wire`);
    }
    if (this.burnt) return; // An open circuit: nothing to describe.
    s.conductance(this.a, this.b, 1 / this.ohms);
  }

  current(r: Readings): number {
    return this.burnt ? 0 : r.across(this.a, this.b) / this.ohms;
  }

  settle(r: Readings, dt: number): void {
    const amps = this.current(r);
    this.heat.update(amps * amps * this.ohms, dt, r.ambient);
    if (this.heat.celsius > this.spec.burnCelsius) this.burnt = true;
  }
}
