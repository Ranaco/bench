/**
 * Bench's default capacitor: what every capacitor runs once Lesson 4, Capacitors is finished, and what the tests check the
 * engine and the board against. The learner writes their own in that lesson; theirs is kept, and can be switched to.
 */
import { type Node, type Part, type Readings, type Stamp } from '../../types';

/**
 * Capacitor: your fourth part, and the first one that remembers.
 *
 * Two metal plates with an insulator between them. Current can't cross the
 * gap, but push current in at a and the same current comes out of b: charge
 * piles up on one plate and leaves the other. The more charge piled up, the
 * higher the voltage across it. How much charge it takes per volt is its size,
 * in farads (a microfarad, µF, is a millionth of one):
 *
 *   charge = farads × volts
 *
 * Current is charge per second, so the current through a capacitor is how
 * fast its voltage changes, times its farads:
 *
 *   amps = farads × (volts now − volts before) ÷ seconds
 *
 * Bench moves time on in ticks of a thousandth of a second (dt). At the end of
 * each tick the voltage across you is what you now hold, and the next tick
 * starts from there. That memory is `held`.
 *
 * Your three jobs, in this order
 *   1. settle(r, dt): remember. Store the volts across you (a to b) in
 *      this.held.
 *   2. current(r): the line above, with this.held as "volts before" and r.dt
 *      as the seconds.
 *   3. stamp(s): the same line, told to the solver. Split it in two:
 *
 *        amps = (farads ÷ dt) × volts now  −  (farads ÷ dt) × held
 *
 *      The first half is exactly a resistor: amps in proportion to volts,
 *      with conductance farads ÷ dt (s.conductance, as in your switch). The
 *      second half doesn't depend on the voltage now at all: it's a fixed
 *      current, flowing the other way, from b back to a. s.currentSource
 *      pushes a fixed current from one node to another. Together: a resistor,
 *      and a push that tries to keep your voltage where it was.
 *
 * It only joins the circuit once stamp is written, and only behaves once
 * settle is too: a capacitor that can't remember would act like a plain
 * resistor.
 *
 * Check yourself
 *   pnpm test:watch   the capacitor tests go from "todo" to passing, job by job
 *   pnpm dev          then open Lesson 4
 */
export class Capacitor implements Part {
  /** Volts across you, a to b, at the end of the last tick: what you're holding. A new capacitor starts empty. */
  held = 0;

  constructor(
    readonly name: string,
    readonly a: Node,
    readonly b: Node,
    /** Your size: charge per volt, in farads. */
    readonly farads: number,
  ) {}

  settle(r: Readings, dt: number): void {
    this.held = r.across(this.a, this.b);
  }

  current(r: Readings): number {
    return (this.farads * (r.across(this.a, this.b) - this.held)) / r.dt;
  }

  stamp(s: Stamp): void {
    const siemens = this.farads / s.dt;
    s.conductance(this.a, this.b, siemens);
    s.currentSource(this.b, this.a, siemens * this.held);
  }
}
