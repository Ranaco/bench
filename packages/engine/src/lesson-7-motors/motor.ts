import { NotWrittenYet, type Node, type Part, type Readings, type Stamp } from '../types';

const FILE = 'packages/engine/src/lesson-7-motors/motor.ts';

/** What a DC motor's datasheet says, in SI units. */
export interface MotorSpec {
  /** The voltage its figures are given at, V ("UN"). */
  readonly volts: number;
  /** Its winding's resistance, Ω ("R"). */
  readonly ohms: number;
  /** Its winding's inductance, H ("L"). */
  readonly henries: number;
  /** Torque per amp through it, N·m/A ("kM"). The same number is the volts it makes per radian a second it turns. */
  readonly torquePerAmp: number;
  /** Friction in its bearings and brushes, N·m ("MR"). */
  readonly frictionTorque: number;
  /** Its rotor's moment of inertia, kg·m² ("J"): how hard it is to speed up or slow down. */
  readonly inertia: number;
  /** Current with nothing on its shaft, A ("I0"). */
  readonly noLoadAmps: number;
  /** Speed with nothing on its shaft, rpm ("n0"). */
  readonly noLoadRpm: number;
  /** Torque it gives held still, N·m ("MH"). */
  readonly stallTorque: number;
  /** The most current it can carry for good without its winding overheating, A ("IN", its thermal limit). */
  readonly ratedAmps: number;
  /** The fastest it's built to turn, rpm ("nmax"). */
  readonly maxRpm: number;
}

/**
 * Faulhaber 1516 T 009 SR, a 15 mm DC micromotor with precious-metal brushes, from its datasheet (series 1516 … SR,
 * edition 2026 Jul. 28), the 9 V column. Unlike a hobby gear motor's, its sheet gives every number a model needs,
 * the winding's inductance and the rotor's inertia included.
 */
export const FAULHABER_1516_009SR: MotorSpec = {
  volts: 9,
  ohms: 32.5,
  henries: 229e-6,
  torquePerAmp: 6.25e-3,
  frictionTorque: 0.12e-3,
  inertia: 0.42e-7, // 0.42 g·cm²
  noLoadAmps: 0.0193,
  noLoadRpm: 12900,
  stallTorque: 1.61e-3,
  ratedAmps: 0.18,
  maxRpm: 15000,
};

/**
 * Motor (DC, brushed): your seventh part, and the first that moves.
 *
 * Inside: a coil of wire on a shaft, between magnets. Current through the
 * coil makes a torque that turns the shaft, `torquePerAmp` newton-metres for
 * every amp. Turning the shaft is written for you (spin). Your jobs are the
 * electrical side: how much current flows, given the volts across you, from
 * plus to minus.
 *
 * Your three jobs, in this order. Each one is a few changes to stamp(s) and
 * current(r), which always say the same thing two ways: current(r) works out
 * the amps from the readings, stamp(s) tells the solver the same rule.
 *
 *   1. Held still, a motor is only its winding: a long thin wire, a resistor
 *      of this.spec.ohms between plus and minus. Write it as your closed
 *      switch: s.conductance, and Ohm's law.
 *
 *   2. It fights back. A coil turning between magnets is a generator: spinning,
 *      the motor makes a voltage of its own, this.backEmf (written for you:
 *      torquePerAmp × speed), pushing against whatever drives it. Only what's
 *      left over pushes current through the winding:
 *
 *        amps = (volts − backEmf) ÷ ohms
 *
 *      Split it the way you did your capacitor's: a resistor, plus a fixed
 *      current of backEmf ÷ ohms flowing the other way, from minus back to
 *      plus (s.currentSource). Now it speeds up until the current only just
 *      covers its friction.
 *
 *   3. The winding is a coil, and a coil's current can't change at once: it
 *      carries on from this.amps, its current at the end of the last step
 *      (remembered for you, in settle). Changing it takes volts:
 *
 *        volts = ohms × amps + backEmf + henries × (amps − this.amps) ÷ dt
 *
 *      Solve it for amps, as you did for job 2. Call `henries ÷ dt` coil: it
 *      adds to ohms, and coil × this.amps adds to the push. In stamp(s) the
 *      step is s.dt; in current(r) it's r.dt. It makes no difference while
 *      the current's steady; switch the motor off and it's the kick.
 *
 * Check yourself
 *   pnpm test:watch   the motor tests go from "todo" to passing, job by job
 *   pnpm dev          then open Lesson 7
 */
export class Motor implements Part {
  /** Written for you. Its coil's current can change far faster than a tick: the circuit follows it in small steps. */
  readonly fast = true;
  /** The current through the winding, + to −, at the end of the last step, A: a coil carries on from there. */
  amps = 0;
  /** How fast the shaft turns, radians per second. Positive while current flows + to −. */
  speed = 0;
  /** How far the shaft has turned since it was put on the board, radians. */
  angle = 0;
  /** True while something holds the shaft still: a finger on it. */
  held = false;

  constructor(
    readonly name: string,
    readonly plus: Node,
    readonly minus: Node,
    readonly spec: MotorSpec = FAULHABER_1516_009SR,
  ) {}

  /** Written for you. The volts it makes by turning, pushing back against its supply. */
  get backEmf(): number {
    return this.spec.torquePerAmp * this.speed;
  }

  stamp(s: Stamp): void {
    throw new NotWrittenYet(this.name, FILE);
  }

  current(r: Readings): number {
    throw new NotWrittenYet(this.name, FILE);
  }

  /** Written for you. Remember the current, for the coil, then turn the shaft. */
  settle(r: Readings, dt: number): void {
    this.amps = this.current(r);
    this.spin(dt);
  }

  /**
   * Written for you. The current's torque speeds the shaft up; friction holds it back, and can stop it but never turn
   * it the other way. Too little torque to beat friction and a stopped shaft stays stopped. How quickly it all
   * happens is the rotor's inertia: torque ÷ inertia is how fast the speed changes.
   */
  spin(dt: number): void {
    if (this.held) {
      this.speed = 0;
      return;
    }
    const { torquePerAmp, frictionTorque, inertia } = this.spec;
    const drive = torquePerAmp * this.amps;
    if (this.speed === 0 && Math.abs(drive) <= frictionTorque) return;
    const turning = this.speed === 0 ? Math.sign(drive) : Math.sign(this.speed);
    const next = this.speed + ((drive - turning * frictionTorque) / inertia) * dt;
    this.speed = Math.sign(next) === -turning ? 0 : next;
    this.angle += this.speed * dt;
  }
}
