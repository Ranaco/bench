import { type Node, type Part, type Readings, type Stamp } from '../types';

/** What a switch's datasheet says about its contacts. */
export interface SwitchSpec {
  /** Resistance of the contacts while they touch ("contact resistance", the most allowed), Ω. */
  readonly closedOhms: number;
  /** Resistance between them while they're apart ("insulation resistance", the least allowed), Ω. */
  readonly openOhms: number;
  /** Most current the contacts are rated to carry ("contact rating"), A… */
  readonly ratedAmps: number;
  /** …at up to this voltage, V. */
  readonly ratedVolts: number;
}

/**
 * E-Switch EG1218, the little SPDT slide switch in breadboard kits (drawing
 * P040040 rev C, 10/30/07): 0.2 A at 30 V DC, contact resistance 50 mΩ max,
 * insulation resistance 100 MΩ min. Each contact is modelled at those limits:
 * the most resistance a closed contact may have, the least an open one may.
 */
export const SLIDE_SWITCH: SwitchSpec = { closedOhms: 0.05, openOhms: 100e6, ratedAmps: 0.2, ratedVolts: 30 };

/**
 * E-Switch TL1105, a 6 mm tact switch: the push button in every kit
 * (datasheet dated 2.28.2018): 50 mA at 12 V DC, contact resistance 100 mΩ
 * max, insulation resistance 100 MΩ min. Modelled at those limits too.
 */
export const TACT_SWITCH: SwitchSpec = { closedOhms: 0.1, openOhms: 100e6, ratedAmps: 0.05, ratedVolts: 12 };


/**
 * Switch: your second part, and a short one. Two metal contacts that either
 * touch or don't.
 *
 *   a ──o   o── b      apart (open): almost nothing gets across
 *   a ──o───o── b      touching (closed): almost nothing is in the way
 *
 * "Almost", both times, and the datasheet says how close:
 *
 *   spec.closedOhms   touching, a few hundredths of an ohm (metal on metal
 *                     is good, not perfect)
 *   spec.openOhms     apart, a hundred million ohms (the plastic between
 *                     them is a very good insulator, not a perfect one)
 *
 * So a switch is a resistor with two values, and `closed` picks which one.
 * You already know how to describe a resistor: look at parts/resistor.ts.
 *
 * The same part is a push button (closed while your finger holds it down) and
 * one side of a slide switch (parts/slide-switch.ts uses two of yours, one per side).
 *
 * Your two jobs
 *   1. stamp(s): one s.conductance() between a and b. Conductance is 1 / ohms,
 *      and the ohms depend on `closed`.
 *   2. current(r): the amps from a to b, by Ohm's law, using the same ohms.
 *
 * No settle() this time: the datasheet gives the contacts a current rating,
 * but nothing about how hot they get, so Bench only warns you when you go
 * past the rating. It doesn't pretend to know when a switch would melt.
 *
 * Check yourself
 *   pnpm test:watch   the switch tests go from "todo" to passing
 *   pnpm dev          then put a switch in the LED loop and flip it
 */
export class Switch implements Part {
  constructor(
    readonly name: string,
    readonly a: Node,
    readonly b: Node,
    /** True while the contacts touch. Flipping the switch or pressing the button changes it. */
    public closed = false,
    readonly spec: SwitchSpec = TACT_SWITCH,
  ) {}

  stamp(s: Stamp): void {
    const ohms = this.closed ? this.spec.closedOhms : this.spec.openOhms;
    s.conductance(this.a, this.b, 1 / ohms)
  }

  current(r: Readings): number {
    const ohms = this.closed ? this.spec.closedOhms : this.spec.openOhms;
    return r.across(this.a, this.b) / ohms
  }
}
