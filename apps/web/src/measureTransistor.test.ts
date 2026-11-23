import { PN2222A } from '@bench/engine';
import { describe, expect, it } from 'vitest';
import { measureTransistor } from './measureTransistor';

/** Your transistor, measured: undefined until its diodes() and action() are written. */
const curve = measureTransistor();

describe.runIf(curve !== undefined)('measuring your transistor for the Graph', () => {
  const points = curve ?? [];

  it('climbs like a diode as the base voltage rises: almost nothing at 0.55 V, tens of milliamps by 0.75 V', () => {
    const at = (volts: number) => points.find((p) => Math.abs(p.baseVolts - volts) < 1e-6)?.collectorAmps ?? Number.NaN;
    expect(at(0.55)).toBeLessThan(1e-3);
    expect(at(0.75)).toBeGreaterThan(10e-3);
    for (const [before, after] of points.slice(1).map((p, i) => [points[i], p] as const)) {
      expect(after.collectorAmps).toBeGreaterThanOrEqual(before.collectorAmps);
    }
  });

  it('gives 255.9 times the base current, with the collector held at 10 V as the datasheet measures gain', () => {
    const working = points.filter((p) => p.collectorAmps > 0.1e-3 && p.collectorAmps < 100e-3);
    expect(working.length).toBeGreaterThan(10);
    for (const p of working) expect(p.collectorAmps / p.baseAmps).toBeCloseTo(PN2222A.forwardGain, 0);
  });
});

if (curve === undefined) {
  it.todo('measuring your transistor for the Graph: needs its diodes() and action()');
}
