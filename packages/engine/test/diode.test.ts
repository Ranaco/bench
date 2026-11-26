/** The 1N4007 against its datasheet (Vishay 88503, revision 29-Apr-2020). */
import { describe, expect, it } from 'vitest';
import { Circuit, Diode, GROUND, VISHAY_1N4007 } from '../src/index';
import { expectConserved, FixedCurrent, Source } from './fixtures';

describe('Diode (1N4007)', () => {
  it('drops less than the datasheet’s 1.1 V maximum at 1 A', () => {
    const c = new Circuit();
    const anode = c.node('anode');
    c.add(new FixedCurrent('I1', GROUND, anode, 1));
    c.add(new Diode('D1', anode, GROUND));
    c.step(0);
    expect(c.voltage(anode)).toBeLessThan(1.1);
    expect(c.voltage(anode)).toBeGreaterThan(0.8); // the model's 0.89 V
    expectConserved(c);
  });

  it('blocks the other way: backwards across 9 V, far less than its 5 µA rated leak', () => {
    const c = new Circuit();
    const top = c.node('top');
    c.add(new Source('V1', top, GROUND, 9));
    const diode = c.add(new Diode('D1', GROUND, top));
    c.step(0);
    expect(Math.abs(c.currentThrough(diode) ?? 1)).toBeLessThan(5e-6);
    expect(VISHAY_1N4007.maxReverseVolts).toBe(1000);
  });
});
