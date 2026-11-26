import type { MotorModel } from '@bench/engine';
import { defineKind } from '../kind';

/** Radians a second in one rpm. */
export const RPM = (2 * Math.PI) / 60;

/** How long its speed is averaged over, s: fifty PWM cycles at 10 ms, so their ripple averages out. */
const AVERAGE_SECONDS = 0.5;

/**
 * Two averages in a row this close count as steady. Ours: wider than what's left of PWM's ripple in a half-second
 * average, far narrower than the change across a spin-up.
 */
const STEADY_SHARE = 0.03;

/** Its speed, added up a half second at a time: the one filling now and the two before it. */
interface MotorMemo {
  halves: { start: number; sum: number; count: number }[];
}

export const motor = defineKind<MotorModel, MotorMemo>({
  kind: 'motor',
  name: 'Motor',
  blurb: 'A DC motor: current through it turns its shaft, and turning, it pushes back',
  pins: [
    { id: 'plus', x: 0, y: -60, name: 'plus (+)' },
    { id: 'minus', x: 0, y: 60, name: 'minus (−)' },
  ],
  box: { x: -30, y: -60, width: 60, height: 120 }, // out to its circle
  defaults: {},
  modules: ['motor'],
  create: (label, nodes, _props, code) => new code.motor(label, nodes.plus, nodes.minus),
  memo: () => ({ halves: [] }),
  track: ({ c, part, memo, written, failed }) => {
    if (!written || failed) return;
    const start = Math.floor(c.time / AVERAGE_SECONDS) * AVERAGE_SECONDS;
    if (memo.halves.at(-1)?.start !== start) memo.halves = [...memo.halves.slice(-2), { start, sum: 0, count: 0 }];
    const half = memo.halves.at(-1);
    if (!half) return;
    half.sum += part.speed / RPM;
    half.count += 1;
  },
  read: ({ part, memo, written, failed }) => {
    if (!written || failed) return { motor: undefined };
    const rpm = part.speed / RPM;
    // The two whole half seconds before the one filling now.
    const whole = memo.halves.slice(0, -1).map((half) => half.sum / Math.max(half.count, 1));
    const [before, last] = memo.halves.length === 3 ? whole : [undefined, undefined];
    const steady = before !== undefined && last !== undefined && Math.abs(last - before) <= STEADY_SHARE * Math.max(Math.abs(last), Math.abs(before));
    return {
      motor: { rpm, turns: part.angle / (2 * Math.PI), backEmf: part.backEmf, held: part.held, averageRpm: last, steady },
      // Its rated current is a limit for good (heat), not for a moment: only spinning faster than it's built to warns.
      over: Math.abs(rpm) > part.spec.maxRpm,
    };
  },
  // A finger on its shaft: held still for as long as it's pressed.
  press: (part, down) => {
    if (part.held === down) return false;
    part.held = down;
    return true;
  },
});
