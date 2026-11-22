import { describe, expect, it } from 'vitest';
import { Battery, Circuit, GROUND, Resistor } from '../../src/index';
import { expectConserved } from '../fixtures';

function batteryWithLoad(loadOhms: number) {
  const c = new Circuit();
  const plus = c.node('plus');
  const battery = c.add(new Battery('B1', plus, GROUND, 9, 1.5));
  const load = c.add(new Resistor('R1', plus, GROUND, loadOhms));
  c.step(0);
  return { c, plus, battery, load };
}

describe('Battery', () => {
  it('shows its full voltage with almost nothing connected', () => {
    const { c, plus } = batteryWithLoad(1e9);
    expect(c.voltage(plus)).toBeCloseTo(9, 6);
    expectConserved(c);
  });

  it('sags under load, like a real battery', () => {
    // 9 V behind 1.5 Ω into 10 Ω: 9 × 10 / 11.5 ≈ 7.83 V at the terminals.
    const { c, plus, battery } = batteryWithLoad(10);
    expect(c.voltage(plus)).toBeCloseTo((9 * 10) / 11.5, 9);
    expect(c.currentThrough(battery)).toBeCloseTo(9 / 11.5, 9);
    expectConserved(c);
  });

  it('delivers volts / ohms into a short circuit, and heats itself doing it', () => {
    const { c, battery, load } = batteryWithLoad(1e-6);
    expect(c.currentThrough(battery)).toBeCloseTo(6, 3);
    // Nearly all 54 W ends up inside the battery, not the wire.
    expect(c.powerOf(load)).toBeLessThan(1e-3);
    expectConserved(c);
  });
});
