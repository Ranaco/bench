/**
 * Bench's electrolytic capacitor (packages/engine/src/parts/electrolytic.ts): your capacitor plus the leak the
 * Nichicon UVR datasheet allows. Most of it needs your capacitor written; until then, it checks it stays out.
 */
import { describe, expect, it } from 'vitest';
import { Battery, Capacitor, Circuit, ENERGIZER_522, Electrolytic, GROUND, Resistor, TICK, UVR_25V, type Node } from '../../src/index';
import { expectConserved, isWritten, SpyStamp } from '../fixtures';

const AT_REST = { time: 0, dt: TICK, ambient: 25, voltage: () => 0, across: () => 0, branchCurrent: () => 0 };
const fresh = () => new Capacitor('C1', 1 as Node, GROUND, 1e-3);
/** It can join the circuit once it can remember (settle) and tell the solver how it behaves (stamp). */
const joins =
  isWritten(() => {
    fresh().settle(AT_REST, TICK);
  }) &&
  isWritten(() => {
    fresh().stamp(new SpyStamp());
  });
const written =
  joins &&
  isWritten(() => {
    fresh().current(AT_REST);
  });

describe('Electrolytic, the datasheet', () => {
  it('leaks 0.01 × µF × V µA at most, so every one empties itself over the same 100 s', () => {
    for (const spec of Object.values(UVR_25V)) {
      const microfarads = spec.farads * 1e6;
      expect(spec.leakAmps * 1e6).toBeCloseTo(0.01 * microfarads * spec.ratedVolts, 9);
      const cap = new Electrolytic('C1', 1 as Node, GROUND, spec);
      expect(cap.leakOhms * spec.farads).toBeCloseTo(100, 9);
    }
  });
});

describe.runIf(!joins)('Electrolytic, before your capacitor can remember and stamp', () => {
  it('stays out of the circuit rather than act like a plain resistor', () => {
    const c = new Circuit();
    const plus = c.node('plus');
    c.add(new Battery('B1', plus, GROUND, ENERGIZER_522.volts, ENERGIZER_522.ohms));
    c.add(new Electrolytic('C1', plus, GROUND));
    c.step(0.01);
    expect(c.notWritten.map((m) => m.method)).toEqual(['stamp']);
    expect(c.voltage(plus)).toBeCloseTo(ENERGIZER_522.volts, 9); // nothing drawn from the battery
  });
});

describe.runIf(written)('Electrolytic, with your capacitor', () => {
  it('charges from the 9 V battery through a resistor, plus to plus', () => {
    const c = new Circuit();
    const plus = c.node('plus');
    const leg = c.node('leg');
    c.add(new Battery('B1', plus, GROUND, ENERGIZER_522.volts, ENERGIZER_522.ohms));
    c.add(new Resistor('R1', plus, leg, 1000));
    const cap = c.add(new Electrolytic('C1', leg, GROUND, UVR_25V[1000]));
    c.step(1);
    // R × C is a second, so about 63 % full; the leak (100 kΩ) takes a hair off that.
    expect(cap.held / ENERGIZER_522.volts).toBeCloseTo(1 - Math.exp(-1), 2);
    expect(c.currentThrough(cap)).toBeGreaterThan(0);
    expectConserved(c);
  });

  it('empties itself through its own leak, left on its own', () => {
    const c = new Circuit();
    const plus = c.node('plus');
    const battery = c.add(new Battery('B1', plus, GROUND, ENERGIZER_522.volts, ENERGIZER_522.ohms));
    const cap = c.add(new Electrolytic('C1', plus, GROUND, UVR_25V[1000]));
    c.step(0.5); // full in a moment, straight across the battery
    const full = cap.held;
    c.remove(battery);
    c.step(100); // one leak time constant
    expect(cap.held / full).toBeCloseTo(Math.exp(-1), 2);
    expect(c.currentThrough(cap)).toBeCloseTo(0, 9); // what leaks out of the plates leaks straight back in
  });
});

if (!written) it.todo('Electrolytic: needs your capacitor, in packages/engine/src/lesson-4-capacitors/capacitor.ts');
