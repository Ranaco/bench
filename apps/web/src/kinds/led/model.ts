import type { LedModel } from '@bench/engine';
import { GLOW_AMPS } from '../../kit';
import { defineKind } from '../kind';

/** What happens to one LED over time. */
interface LedMemo {
  /** When it last started glowing, circuit time, and the most current it's carried since; undefined while dark. */
  lit: { since: number; peak: number } | undefined;
  /** Whether it's glowing now, and how many times it's come on. */
  on: boolean;
  flips: number;
}

export const led = defineKind<LedModel, LedMemo>({
  kind: 'led',
  name: 'LED',
  blurb: 'Lights up when current flows anode → cathode',
  pins: [
    { id: 'anode', x: 0, y: -60, name: 'anode (+)' },
    { id: 'cathode', x: 0, y: 60, name: 'cathode (−)' },
  ],
  box: { x: -24, y: -60, width: 66, height: 120 }, // out to the tips of its light arrows
  defaults: {},
  modules: ['led'],
  create: (label, nodes, _props, code) => new code.led(label, nodes.anode, nodes.cathode),
  memo: () => ({ lit: undefined, on: false, flips: 0 }),
  track: ({ c, part, memo, failed }) => {
    const amps = failed || part.burnt ? 0 : (c.currentThrough(part) ?? 0);
    if (amps < GLOW_AMPS) memo.lit = undefined;
    else if (!memo.lit) memo.lit = { since: c.time, peak: amps };
    else if (amps > memo.lit.peak) memo.lit = { since: memo.lit.since, peak: amps };
    const on = amps >= GLOW_AMPS;
    if (on && !memo.on) memo.flips++;
    memo.on = on;
  },
  read: ({ c, part, memo, amps, seen, failed }) => ({
    celsius: part.temperature,
    burnt: part.burnt,
    over: !part.burnt && (amps ?? 0) > part.spec.maxAmps,
    glowing: memo.lit && c.time - memo.lit.since,
    peakAmps: memo.lit?.peak,
    // How bright it looks: PWM too fast for an eye looks steady, at its average.
    glowAmps: failed || part.burnt ? 0 : (seen ?? amps),
    flips: memo.flips,
  }),
});
