import { type Node, type Part, type Readings, type Stamp } from '../types';

/** What a potentiometer's datasheet says. */
export interface PotSpec {
  /** Resistance of the whole track, end to end ("standard resistance"), Ω. */
  readonly totalOhms: number;
  /** What's left between the wiper and an end pin when it's turned all the way to it ("residual resistance", the most allowed), Ω. */
  readonly residualOhms: number;
  /** How much of the turn, at each end, the wiper sits still on the end of the track, as a fraction of the whole turn. */
  readonly deadZone: number;
  /** How far it turns, end stop to end stop ("mechanical angle"), degrees. */
  readonly turnDegrees: number;
  /** Most power the whole track may turn into heat ("power rating"), W. */
  readonly ratedWatts: number;
  /** Most voltage across it ("maximum operating voltage"), V DC. */
  readonly ratedVolts: number;
}

/**
 * Bourns PTV09, a 9 mm carbon-track potentiometer, 10 kΩ with a linear taper
 * (datasheet REV. 01/25). Standard resistance 10 kΩ ±20 % (the nominal is
 * used); residual resistance "500 ohms or ±1 % max." (500 Ω is used, the most
 * it allows); its linear taper (B0) rises in a straight line from 5 % to 95 %
 * of the rotational travel; mechanical angle 280°; 0.05 W; 20 V DC.
 */
export const KNOB_10K: PotSpec = {
  totalOhms: 10_000,
  residualOhms: 500,
  deadZone: 0.05,
  turnDegrees: 280,
  ratedWatts: 0.05,
  ratedVolts: 20,
};

/**
 * Potentiometer: your third part, the knob. A resistor with a third pin, the
 * wiper, that slides along its track as you turn it.
 *
 *            wiper
 *              │
 *   a ──/\/\/\/▼/\/\/\── b
 *       legs[0]  legs[1]
 *
 * So it's two resistors in a row, sharing the wiper:
 *
 *   legs[0]   from a to the wiper
 *   legs[1]   from the wiper to b
 *
 * Turning it doesn't change the total, only where the wiper splits it: turn
 * towards a and legs[0] shrinks while legs[1] grows by the same amount.
 * `turn` runs from 0 (all the way towards a) to 1 (all the way towards b).
 *
 * legs() is written for you, from the datasheet: it works out the two
 * resistances for the current `turn`. Read it, then use it.
 *
 * Your two jobs
 *   1. stamp(s): one s.conductance() for each leg. You've done one before, in
 *      switch.ts; this is two, one between a and the wiper and one between the
 *      wiper and b.
 *   2. current(r): the amps from a into the wiper, through legs[0], by Ohm's
 *      law.
 *
 * No settle() again: the datasheet gives a power rating, but nothing about how
 * fast the track heats, so Bench warns you past the rating instead.
 *
 * Check yourself
 *   pnpm test:watch   the knob tests go from "todo" to passing
 *   pnpm dev          then open Lesson 3
 */
export class Potentiometer implements Part {
  constructor(
    readonly name: string,
    readonly a: Node,
    readonly wiper: Node,
    readonly b: Node,
    /** How far it's turned: 0 is all the way towards a, 1 all the way towards b. */
    public turn = 0.5,
    readonly spec: PotSpec = KNOB_10K,
  ) {}

  /**
   * Written for you. The resistance from a to the wiper, and from the wiper to
   * b, in ohms. In the dead zone at each end the wiper rests on the end of the
   * track, where the datasheet allows up to residualOhms to be left. In
   * between, it slides along at an even rate (a linear taper).
   */
  legs(): readonly [number, number] {
    const { totalOhms, residualOhms, deadZone } = this.spec;
    const along = Math.min(1, Math.max(0, (this.turn - deadZone) / (1 - 2 * deadZone)));
    const toA = residualOhms + along * (totalOhms - 2 * residualOhms);
    return [toA, totalOhms - toA];
  }

  stamp(s: Stamp): void {
    const [toA, toB] = this.legs();
    s.conductance(this.a, this.wiper, 1 / toA);
    s.conductance(this.wiper, this.b, 1 / toB);
  }

  current(r: Readings): number {
    const [toA] = this.legs();
    return r.across(this.a, this.wiper) / toA;
  }
}
