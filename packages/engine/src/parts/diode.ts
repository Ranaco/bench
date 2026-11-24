import { THERMAL_VOLTAGE, type Curve, type Node, type Part, type Readings, type Stamp } from '../types';

/** A diode's maker's model of it (its SPICE numbers), and its ratings. */
export interface DiodeSpec {
  /** How much it leaks before it turns on, A (SPICE "IS"). */
  readonly saturationAmps: number;
  /** How gently its current climbs with voltage: 1 is the steepest a junction can (SPICE "N"). */
  readonly ideality: number;
  /** The resistance of its leads and silicon, Ω (SPICE "RS"). */
  readonly seriesOhms: number;
  /** The most average forward current it's rated for, A ("IF(AV)"). */
  readonly ratedAmps: number;
  /** The most reverse voltage it's rated for, V ("VRRM"). */
  readonly maxReverseVolts: number;
}

/**
 * 1N4007, a 1 A general purpose rectifier in a DO-41 case, the one in every kit. Its datasheet (Vishay, document
 * 88503, revision 29-Apr-2020) lists "freewheeling diodes" among its uses, which is what it does across a motor.
 * The model is Vishay's own SPICE model for it (www.vishay.com/docs/89789/1n4007.txt); Vishay's 2024 model of the
 * 1N4004, the same die, has the same forward numbers. Ratings from the datasheet: 1.0 A average, 1000 V reverse.
 * Its forward voltage at 1 A comes out at 0.89 V, inside the datasheet's 1.1 V maximum.
 */
export const VISHAY_1N4007: DiodeSpec = {
  saturationAmps: 1.43733e-8,
  ideality: 1.80829,
  seriesOhms: 0.0414712,
  ratedAmps: 1,
  maxReverseVolts: 1000,
};

/**
 * Diode: lets current through one way, anode to cathode, and blocks it the
 * other. It's your LED without the light: a junction (Shockley's equation,
 * with the maker's numbers) behind a little series resistance.
 */
export class Diode implements Part {
  private readonly curve: Curve;
  private junction: Node | undefined;

  constructor(
    readonly name: string,
    readonly anode: Node,
    readonly cathode: Node,
    readonly spec: DiodeSpec = VISHAY_1N4007,
  ) {
    const steepness = spec.ideality * THERMAL_VOLTAGE;
    this.curve = {
      current: (volts) => spec.saturationAmps * Math.expm1(volts / steepness),
      slope: (volts) => (spec.saturationAmps / steepness) * Math.exp(volts / steepness),
    };
  }

  stamp(s: Stamp): void {
    this.junction = s.internal('junction');
    s.junction(this.anode, this.junction, this.curve);
    s.conductance(this.junction, this.cathode, 1 / this.spec.seriesOhms);
  }

  current(r: Readings): number {
    if (this.junction === undefined) return 0;
    return r.across(this.junction, this.cathode) / this.spec.seriesOhms;
  }
}
