/**
 * The engine as the builder uses it: every part has its own pin nodes, wires
 * join pins, and parts come and go while the circuit runs.
 */
import { describe, expect, it } from 'vitest';
import {
  Battery,
  Circuit,
  ENERGIZER_522,
  GROUND,
  Ground,
  Junction,
  Led,
  Resistor,
  JUMPER,
  Wire,
  type Node,
  type Part,
} from '../src/index';
import { expectConserved, run } from './fixtures';

describe('Circuit.remove and release', () => {
  it('stops a removed part carrying current, and leaves the rest running', () => {
    const c = new Circuit();
    const plus = c.node('plus');
    c.add(new Battery('B1', plus, GROUND, 9, 1));
    const r1 = c.add(new Resistor('R1', plus, GROUND, 100));
    const r2 = c.add(new Resistor('R2', plus, GROUND, 100));
    c.step(0);
    c.remove(r2);
    c.step(0);
    expect(c.currentThrough(r1)).toBeCloseTo(9 / 101 / 1, 3);
    expectConserved(c);
  });

  it('keeps the state of the parts that stay', () => {
    const c = new Circuit();
    const plus = c.node('plus');
    c.add(new Battery('B1', plus, GROUND, 9, 1));
    const hot = c.add(new Resistor('R1', plus, GROUND, 50)); // 1.5 W: heats up
    const other = c.add(new Resistor('R2', plus, GROUND, 10000));
    run(c, 5);
    const warm = hot.temperature;
    c.remove(other);
    c.step(0.001);
    expect(hot.temperature).toBeGreaterThan(warm - 0.5);
  });

  it('reuses released nodes', () => {
    const c = new Circuit();
    const a = c.node('a');
    c.release(a);
    expect(c.node('b')).toBe(a);
  });
});

describe('Ground', () => {
  it('holds its pin at exactly 0 V and carries the return current', () => {
    const c = new Circuit();
    const plus = c.node('plus');
    const minus = c.node('minus');
    const gnd = c.node('gnd');
    c.add(new Battery('B1', plus, minus, 9, 1));
    c.add(new Resistor('R1', plus, minus, 8)); // the load, across the battery
    c.add(new Wire('W1', minus, gnd));
    const ground = c.add(new Ground('GND', gnd));
    c.step(0);
    expect(c.voltage(gnd)).toBeCloseTo(0, 9);
    // Nothing else touches ground, so no current returns through it.
    expect(Math.abs(c.currentThrough(ground) ?? Number.NaN)).toBeLessThan(1e-9);
    expectConserved(c);
  });

  it('is optional: a loop with no ground still has the right currents', () => {
    const c = new Circuit();
    const plus = c.node('plus');
    const minus = c.node('minus');
    c.add(new Battery('B1', plus, minus, ENERGIZER_522.volts, ENERGIZER_522.ohms));
    const r = c.add(new Resistor('R1', plus, minus, 100));
    c.step(0);
    expect(c.currentThrough(r)).toBeCloseTo(ENERGIZER_522.volts / (100 + ENERGIZER_522.ohms), 6);
    expect(c.across(plus, minus)).toBeCloseTo((100 * ENERGIZER_522.volts) / (100 + ENERGIZER_522.ohms), 6);
  });
});

describe('Junction', () => {
  it('joins wires without adding anything: two 5 cm halves carry what one 10 cm jumper did', () => {
    const run = (split: boolean) => {
      const c = new Circuit();
      const plus = c.node('plus');
      const mid = c.node('mid');
      c.add(new Battery('B1', plus, GROUND, ENERGIZER_522.volts, ENERGIZER_522.ohms));
      const r = c.add(new Resistor('R1', mid, GROUND, 330));
      if (split) {
        const j = c.node('j');
        c.add(new Junction('J1', j));
        c.add(new Wire('W1a', plus, j, { ...JUMPER, lengthMetres: JUMPER.lengthMetres / 2 }));
        c.add(new Wire('W1b', j, mid, { ...JUMPER, lengthMetres: JUMPER.lengthMetres / 2 }));
      } else {
        c.add(new Wire('W1', plus, mid));
      }
      c.step(0);
      expectConserved(c);
      return c.currentThrough(r) ?? Number.NaN;
    };
    expect(run(true)).toBeCloseTo(run(false), 12);
  });
});

/** A small seeded random generator, so a failing board can be rebuilt. */
function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    pick: <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
  };
}

describe('random boards', () => {
  it('never throws, and obeys the conservation laws whenever it settles', () => {
    const kinds = ['battery', 'resistor', 'led', 'ground'] as const;
    for (let seed = 1; seed <= 150; seed++) {
      const rng = random(seed);
      const c = new Circuit();
      const pins: Node[] = [];
      const parts: Part[] = [];
      const count = 2 + rng.int(6);
      for (let i = 0; i < count; i++) {
        const kind = rng.pick(kinds);
        const a = c.node(`p${String(i)}a`);
        pins.push(a);
        if (kind === 'ground') {
          parts.push(c.add(new Ground(`G${String(i)}`, a)));
          continue;
        }
        const b = c.node(`p${String(i)}b`);
        pins.push(b);
        if (kind === 'battery') parts.push(c.add(new Battery(`B${String(i)}`, a, b, 1 + rng.int(12), 0.2 + rng.next() * 2)));
        else if (kind === 'resistor') parts.push(c.add(new Resistor(`R${String(i)}`, a, b, rng.pick([10, 47, 100, 330, 1000, 4700, 100000]))));
        else parts.push(c.add(new Led(`D${String(i)}`, a, b)));
      }
      // Wire random pins together: shorts, loops, dangling pins and parts wired to themselves included.
      const wires: Wire[] = [];
      const wireCount = rng.int(pins.length + 3);
      for (let w = 0; w < wireCount; w++) {
        wires.push(c.add(new Wire(`W${String(w)}`, rng.pick(pins), rng.pick(pins))));
      }

      const context = `seed ${String(seed)}`;
      for (let frame = 0; frame < 20; frame++) {
        let result;
        try {
          result = c.step(1 / 60);
        } catch (error) {
          throw new Error(`${context}: step threw ${String(error)}`, { cause: error });
        }
        if (result.converged) {
          const { worstNodeAmps, powerImbalance, powerDelivered } = c.audit();
          expect(worstNodeAmps, `${context}: current in ≠ out`).toBeLessThan(1e-6 * (1 + powerDelivered));
          expect(powerImbalance, `${context}: power`).toBeLessThan(1e-6 * (1 + powerDelivered));
        }
        // Halfway through, pull a wire out while it runs.
        if (frame === 10 && wires.length > 0) c.remove(wires[rng.int(wires.length)]);
      }
      expect(parts.length).toBeGreaterThan(0);
    }
  });
});
