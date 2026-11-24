import { UVR_25V, type ElectrolyticModel, type ElectrolyticSpec } from '@bench/engine';
import type { Trace } from '../../sim/readings';
import { defineKind, type Props } from '../kind';

/** The capacitors on offer, µF: the Nichicon UVR 25 V ones, from small to large. */
export const CAPACITOR_VALUES = [220, 330, 470, 1000, 2200] as const;

/** A capacitor's datasheet row, from its saved value (1000 µF when the value isn't one on offer). */
export function capacitorSpec(props: Props): ElectrolyticSpec {
  const value = CAPACITOR_VALUES.find((uf) => uf === Number(props.uf)) ?? 1000;
  return UVR_25V[value];
}

/** How far back a capacitor's trace goes, s. */
export const TRACE_SECONDS = 30;

/** Reverse voltage a capacitor is allowed before it counts as charged the wrong way: well clear of the solver's noise. */
const REVERSE_VOLTS = 1e-3;

/** How far back a capacitor's rate of climb is measured, s: long enough to smooth over frame-to-frame jitter. */
const RATE_SECONDS = 0.5;

/** Adds `volts` at `now` to a trace, and forgets what's older than `span` seconds. */
export function record(trace: { times: number[]; volts: number[] }, now: number, volts: number, span: number): void {
  if (trace.times.at(-1) === now) {
    trace.volts[trace.volts.length - 1] = volts; // a re-solve with no time passed: the same moment
  } else {
    trace.times.push(now);
    trace.volts.push(volts);
  }
  const oldest = trace.times.findIndex((t) => t >= now - span);
  if (oldest > 0) {
    trace.times.splice(0, oldest);
    trace.volts.splice(0, oldest);
  }
}

/** A trace's change per second over its last RATE_SECONDS. */
function rateOf(trace: Trace): number | undefined {
  const now = trace.times.at(-1);
  if (now === undefined) return undefined;
  const back = trace.times.findLastIndex((t) => t <= now - RATE_SECONDS);
  if (back === -1) return undefined;
  return ((trace.volts.at(-1) ?? 0) - (trace.volts[back] ?? 0)) / (now - (trace.times[back] ?? now));
}

export const capacitor = defineKind<ElectrolyticModel, { times: number[]; volts: number[] }>({
  kind: 'capacitor',
  name: 'Capacitor',
  blurb: 'Stores charge: it fills up, holds it, and gives it back',
  pins: [
    { id: 'plus', x: 0, y: -60, name: 'plus (+)' },
    { id: 'minus', x: 0, y: 60, name: 'minus (−)' },
  ],
  box: { x: -24, y: -60, width: 60, height: 120 }, // to the right of its + sign
  defaults: { uf: 1000 },
  modules: ['electrolytic', 'capacitor'],
  create: (label, nodes, props, code) => new code.electrolytic(label, nodes.plus, nodes.minus, capacitorSpec(props), code.capacitor),
  memo: () => ({ times: [], volts: [] }),
  track: ({ c, part, memo }) => {
    record(memo, c.time, part.held, TRACE_SECONDS);
  },
  trace: (memo) => memo,
  read: ({ part, memo, written }) => {
    // Its watts are going into (or coming back out of) its charge, not into heat.
    const { ratedVolts, farads } = part.spec;
    const reversed = written && part.held < -REVERSE_VOLTS;
    return {
      over: reversed || part.held > ratedVolts,
      capacitor: { held: written ? part.held : 0, farads, ratedVolts, reversed, rising: written ? rateOf(memo) : undefined },
    };
  },
});
