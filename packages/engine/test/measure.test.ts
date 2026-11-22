import { describe, expect, it } from 'vitest';
import { Circuit, GROUND, NotWrittenYet, Resistor, Supply, sweep, type Part } from '../src/index';
import { expectConserved, TestDiode } from './fixtures';

describe('Supply', () => {
  it('holds its voltage whatever is connected', () => {
    const c = new Circuit();
    const plus = c.node('plus');
    const supply = c.add(new Supply('V1', plus, GROUND, 5));
    c.add(new Resistor('R1', plus, GROUND, 10));
    c.step(0);
    expect(c.voltage(plus)).toBeCloseTo(5, 6);
    expect(c.currentThrough(supply)).toBeCloseTo(0.5, 9);
    expectConserved(c);
  });
});

describe('sweep', () => {
  it("traces a resistor's straight line", () => {
    const points = sweep((a, b) => new Resistor('R1', a, b, 100), 0, 5, 5) ?? [];
    expect(points.map((p) => p.volts)).toEqual([0, 1, 2, 3, 4, 5]);
    points.forEach((p) => {
      expect(p.amps).toBeCloseTo(p.volts / 100, 9);
    });
  });

  it("traces a diode's knee: nothing, then a lot", () => {
    const points = sweep((a, b) => new TestDiode('D1', a, b), 0, 0.8, 80) ?? [];
    expect(points).toHaveLength(81);
    for (let i = 1; i < points.length; i++) expect(points[i].amps).toBeGreaterThan(points[i - 1].amps);
    expect(points[0].amps).toBeCloseTo(0, 12);
    expect(points[80].amps).toBeGreaterThan(1000 * points[40].amps);
  });

  it("returns nothing for a part that isn't written yet", () => {
    const stub: Part = {
      name: 'X1',
      stamp: () => {
        throw new NotWrittenYet('X1', 'x.ts');
      },
      current: () => 0,
    };
    expect(sweep(() => stub, 0, 3, 10)).toBeUndefined();
  });
});
