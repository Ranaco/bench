/** How bright a flickering light looks: flicker past what an eye can follow is seen as its average, slower as it is. */
import { describe, expect, it } from 'vitest';
import { Circuit, FLICKER_FUSION_HZ, GROUND, Resistor, SeenAverage, TICK } from '../src';
import { FixedCurrent } from './fixtures';

const TICKS = Math.round(1 / (FLICKER_FUSION_HZ * TICK));

/** What's seen of a light switched on for `on` ticks out of every `period`, over `seconds`, one value per tick. */
function seenOf(period: number, on: number, seconds: number): number[] {
  const seen = new SeenAverage(0, TICKS);
  const out: number[] = [];
  for (let tick = 0; tick < seconds / TICK; tick++) {
    seen.add(tick % period < on ? 1 : 0);
    out.push(seen.amps);
  }
  return out;
}

/** Highest and lowest after the first half second, once it's settled. */
function range(values: readonly number[]): { low: number; high: number } {
  const settled = values.slice(500);
  return { low: Math.min(...settled), high: Math.max(...settled) };
}

describe('A light as an eye sees it', () => {
  it('starts as it is: a light that’s already on doesn’t fade in', () => {
    expect(new SeenAverage(0.02, TICKS).amps).toBeCloseTo(0.02, 12);
  });

  it('sees PWM faster than flicker fusion as steady, at its average', () => {
    // A few percent of fully on at most (averaged over one screen frame instead, half-on 100 Hz PWM jumped from
    // frame to frame); a little more just past flicker fusion, where less of it cancels.
    for (const [period, on, ripple] of [
      [10, 5, 0.04], // 100 Hz, half on
      [10, 1, 0.04], // a tenth
      [10, 9, 0.04], // nine tenths
      [7, 3, 0.04], // a period that doesn't fit its window evenly
      [13, 6, 0.06], // 77 Hz
    ] as const) {
      const { low, high } = range(seenOf(period, on, 2));
      expect(high - low, `${String(on)} of ${String(period)} ms`).toBeLessThan(ripple);
      expect((low + high) / 2).toBeCloseTo(on / period, 1);
    }
  });

  it('still sees a slow blink go all the way on and off', () => {
    const { low, high } = range(seenOf(200, 100, 2)); // 5 Hz
    expect(high).toBeGreaterThan(0.99);
    expect(low).toBeLessThan(0.01);
  });

  it('keeps no rounding error over a long run', () => {
    const values = seenOf(10, 5, 120);
    const last = values.slice(-10);
    expect(Math.min(...last)).toBeGreaterThan(0.48);
    expect(Math.max(...last)).toBeLessThan(0.52);
  });
});

describe('Circuit, the light as seen', () => {
  it('follows each part’s current tick by tick, and forgets a part taken out', () => {
    const c = new Circuit();
    const a = c.node('a');
    const source = c.add(new FixedCurrent('I1', GROUND, a, 0.02));
    const load = c.add(new Resistor('R1', a, GROUND, 100));
    expect(c.seenCurrent(source)).toBeUndefined(); // no ticks yet
    c.step(0);
    expect(c.seenCurrent(source)).toBeUndefined(); // a solve that doesn't move time on adds nothing
    c.step(TICK);
    expect(c.seenCurrent(source)).toBeCloseTo(0.02, 12); // starts as it is
    for (let tick = 0; tick < 200; tick++) {
      source.amps = tick % 10 < 5 ? 0.02 : 0;
      c.step(TICK);
    }
    expect(c.seenCurrent(source)).toBeGreaterThan(0.0095);
    expect(c.seenCurrent(source)).toBeLessThan(0.0105);
    c.remove(load);
    expect(c.seenCurrent(load)).toBeUndefined();
  });
});
