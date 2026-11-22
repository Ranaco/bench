import { describe, expect, it } from 'vitest';
import { Circuit, GROUND, QUARTER_WATT, Resistor } from '../../src/index';
import { expectConserved, run, Source } from '../fixtures';

/** A resistor with an exact voltage across it. */
function resistorAt(volts: number, ohms: number) {
  const c = new Circuit();
  const top = c.node('top');
  const source = c.add(new Source('V1', top, GROUND, volts));
  const resistor = c.add(new Resistor('R1', top, GROUND, ohms));
  c.step(0);
  return { c, source, resistor };
}

describe('Resistor', () => {
  it("follows Ohm's law", () => {
    const { c, resistor } = resistorAt(9, 330);
    expect(c.currentThrough(resistor)).toBeCloseTo(9 / 330, 9);
    expectConserved(c);
  });

  it('can change value while running', () => {
    const { c, resistor } = resistorAt(9, 330);
    resistor.ohms = 1000;
    c.step(0);
    expect(c.currentThrough(resistor)).toBeCloseTo(0.009, 9);
    expectConserved(c);
  });

  it('runs within its limit at its rated power', () => {
    // 0.25 W: settles at 25 °C + 0.25 W × 340 K/W = 110 °C.
    const { c, resistor } = resistorAt(Math.sqrt(0.25 * 100), 100);
    run(c, 120);
    expect(resistor.temperature).toBeCloseTo(110, 0);
    expect(resistor.temperature).toBeLessThan(QUARTER_WATT.maxCelsius);
    expect(resistor.burnt).toBe(false);
  });

  it('burns out open when badly overloaded, then cools', () => {
    // 2 W into a ¼ W resistor.
    const { c, resistor } = resistorAt(Math.sqrt(2 * 100), 100);
    run(c, 15);
    expect(resistor.burnt).toBe(true);
    c.step(0);
    expect(Math.abs(c.currentThrough(resistor) ?? Number.NaN)).toBeLessThan(1e-9);
    const hot = resistor.temperature;
    run(c, 30);
    expect(resistor.temperature).toBeLessThan(hot);
  });
});
