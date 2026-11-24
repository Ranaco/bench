import type { TransistorModel } from '@bench/engine';
import type { TransistorState } from '../../sim/readings';
import { defineKind } from '../kind';

/**
 * Below this into the base, a transistor counts as off. Ours, not the datasheet's: a microamp into a PN2222A lets
 * through a quarter of a milliamp, under the faintest glow on the LED's datasheet.
 */
const OFF_BASE_AMPS = 1e-6;

/**
 * Once the collector carries less than this share of what the base current could let through, something else in
 * the circuit is setting the current, not the transistor: it's switched fully on (saturated). Ours: a line drawn
 * clear of the noise either side.
 */
const ON_SHARE = 0.9;

/** How far back the highest collector voltage is kept, s: long enough to read a kick that lasted microseconds. */
const PEAK_SECONDS = 1;

/** The highest collector voltage in each step: what a kick leaves, for a second. */
interface TransistorMemo {
  peaks: { at: number; volts: number }[];
}

export const transistor = defineKind<TransistorModel, TransistorMemo>({
  kind: 'transistor',
  name: 'Transistor',
  blurb: 'An NPN transistor: a small current into its base lets a big one flow from collector to emitter',
  pins: [
    { id: 'collector', x: 20, y: -60, name: 'collector (C)' },
    { id: 'base', x: -60, y: 0, name: 'base (B)' },
    { id: 'emitter', x: 20, y: 60, name: 'emitter (E)' },
  ],
  box: { x: -60, y: -60, width: 96, height: 120 }, // out to the round of its case
  defaults: {},
  modules: ['transistor'],
  create: (label, nodes, _props, code) => new code.transistor(label, nodes.collector, nodes.base, nodes.emitter),
  memo: () => ({ peaks: [] }),
  track: ({ c, part, memo, failed }) => {
    const highest = part.takeHighest?.();
    if (!failed && highest !== undefined && highest > -Infinity) memo.peaks.push({ at: c.time, volts: highest });
    memo.peaks = memo.peaks.filter((peak) => peak.at > c.time - PEAK_SECONDS);
  },
  read: ({ c, part, memo, written, failed, amps, watts }) => {
    // Its leads are given in the lesson's stub, so the nodes inside them exist once its stamp has run at all.
    const live = written && !failed;
    const collectorAmps = live ? amps : 0;
    const baseAmps = live ? c.across(part.base, part.inside.base) / part.spec.baseOhms : 0;
    const collectorVolts = failed ? 0 : c.across(part.collector, part.emitter);
    const baseVolts = failed ? 0 : c.across(part.base, part.emitter);
    const state: TransistorState | undefined =
      baseAmps < OFF_BASE_AMPS
        ? 'off'
        : collectorAmps === undefined
          ? undefined
          : collectorAmps < ON_SHARE * part.spec.forwardGain * baseAmps
            ? 'on'
            : 'amplifying';
    const { maxCollectorAmps, maxCollectorVolts, maxWatts } = part.spec;
    const highestVolts = part.takeHighest && memo.peaks.length > 0 ? Math.max(...memo.peaks.map((peak) => peak.volts)) : undefined;
    const over =
      (collectorAmps ?? 0) > maxCollectorAmps ||
      Math.max(collectorVolts, highestVolts ?? collectorVolts) > maxCollectorVolts ||
      watts > maxWatts;
    return {
      volts: collectorVolts,
      over: live && over,
      // Out of the circuit until its stamp is written: nothing to read.
      transistor: live ? { baseAmps, collectorAmps, collectorVolts, baseVolts, state, highestVolts } : undefined,
    };
  },
});
