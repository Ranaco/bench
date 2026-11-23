/**
 * Tests for your transistor (packages/engine/src/lesson-5-transistors/transistor.ts), against the PN2222A's
 * datasheets. Each job's tests show as "todo" until that job is written, then they start checking; the ones that
 * run a circuit wait for all three.
 */
import { describe, expect, it } from 'vitest';
import { Circuit, GROUND, PN2222A, Resistor, TICK, Transistor, type Inside, type Node, type Readings } from '../../src/index';
import { expectConserved, FixedCurrent, isWritten, Source, SpyStamp } from '../fixtures';

const C = 1 as Node;
const B = 2 as Node;
const E = 3 as Node;

/** What one of the transistor's jobs stamps, on a transistor of its own: whether it runs, and what it stamped. */
function job(run: (q: Transistor, s: SpyStamp, inside: Inside) => void) {
  const spy = new SpyStamp();
  const q = new Transistor('Q1', C, B, E);
  const inside = q.leads(spy);
  const runs = isWritten(() => {
    run(q, spy, inside);
  });
  return { spy, q, runs };
}

const diodes = job((q, s, inside) => {
  q.diodes(s, inside);
});
const action = job((q, s, inside) => {
  q.action(s, inside);
});
// Written means it runs and stamps something: an emptied body that stamps nothing doesn't count yet.
const diodesWritten = diodes.runs && diodes.spy.junctions.length > 0;
const actionWritten = action.runs && action.spy.controlled.length > 0;
const currentWritten = isWritten(() => {
  new Transistor('Q1', C, B, E).current(readingsAt({}));
});
const allWritten = diodesWritten && actionWritten && currentWritten;

/** Readings with the given volts at each node (0 elsewhere), as a solve would leave them. */
function readingsAt(volts: Readonly<Partial<Record<number, number>>>): Readings {
  const at = (node: Node) => volts[node] ?? 0;
  return { time: 0, dt: TICK, ambient: 25, voltage: at, across: (a, b) => at(a) - at(b), branchCurrent: () => 0 };
}

describe.runIf(diodesWritten)('Transistor.diodes, job 1: two diodes sharing the base', () => {
  it('has one diode from the inside base to the emitter, and one to the inside collector', () => {
    const { spy, q } = diodes;
    expect(spy.junctions).toHaveLength(2);
    expect(spy.junctions).toContainEqual({ anode: q.inside.base, cathode: E, curve: q.baseEmitter });
    expect(spy.junctions).toContainEqual({ anode: q.inside.base, cathode: q.inside.collector, curve: q.baseCollector });
  });
});

describe.runIf(actionWritten)('Transistor.action, job 2: the transistor action', () => {
  it('sets a current collector to emitter by the base-emitter voltage, and back by the base-collector voltage', () => {
    const { spy, q } = action;
    const { base, collector } = q.inside;
    expect(spy.controlled).toHaveLength(2);
    expect(spy.controlled).toContainEqual({ from: collector, to: E, plus: base, minus: E, curve: q.transfer });
    expect(spy.controlled).toContainEqual({ from: E, to: collector, plus: base, minus: collector, curve: q.transfer });
  });
});

describe.runIf(currentWritten)('Transistor.current, job 3: the collector current', () => {
  it('is the current through the collector’s resistance', () => {
    const q = new Transistor('Q1', C, B, E);
    const { collector } = q.leads(new SpyStamp());
    // 0.15 V across its 1 Ω: 150 mA in at the collector.
    expect(q.current(readingsAt({ [C]: 5, [collector]: 4.85 }))).toBeCloseTo(0.15, 12);
    expect(q.current(readingsAt({ [C]: 5, [collector]: 5 }))).toBe(0);
  });
});

/** A transistor with its emitter on ground and fixed currents forced into its base and collector. */
function forced(baseAmps: number, collectorAmps: number) {
  const c = new Circuit();
  const collector = c.node('collector');
  const base = c.node('base');
  c.add(new FixedCurrent('IB', GROUND, base, baseAmps));
  c.add(new FixedCurrent('IC', GROUND, collector, collectorAmps));
  const q = c.add(new Transistor('Q1', collector, base, GROUND));
  const result = c.step(0);
  return { c, q, collector, base, result };
}

/** Collector held at `volts` above the emitter, a fixed current into the base: the datasheet's gain test. */
function gainAt(collectorVolts: number, baseAmps: number) {
  const c = new Circuit();
  const collector = c.node('collector');
  const base = c.node('base');
  const supply = c.add(new Source('VCE', collector, GROUND, collectorVolts));
  c.add(new FixedCurrent('IB', GROUND, base, baseAmps));
  const q = c.add(new Transistor('Q1', collector, base, GROUND));
  const result = c.step(0);
  const collectorAmps = c.currentThrough(supply) ?? Number.NaN; // out of the supply's +, into the collector
  return { c, q, result, collectorAmps, gain: collectorAmps / baseAmps };
}

describe.runIf(allWritten)('Transistor in a circuit, against the datasheets', () => {
  it('lets out at the emitter exactly what goes in at the base and the collector', () => {
    const c = new Circuit();
    const supply = c.node('supply');
    const collector = c.node('collector');
    const base = c.node('base');
    const emitter = c.node('emitter');
    c.add(new Source('V1', supply, GROUND, 9));
    c.add(new Resistor('RC', supply, collector, 1000));
    c.add(new Resistor('RB', supply, base, 470000));
    const re = c.add(new Resistor('RE', emitter, GROUND, 100));
    const q = c.add(new Transistor('Q1', collector, base, emitter));
    expect(c.step(0).converged).toBe(true);
    const r = readingsFrom(c);
    const collectorAmps = q.current(r);
    const baseAmps = q.baseCurrent(r);
    // To within the solver's GMIN: a picoamp to ground at each node.
    expect(Math.abs((c.currentThrough(re) ?? 0) - (collectorAmps + baseAmps))).toBeLessThan(1e-10);
    expectConserved(c);
  });

  it('amplifies: while it isn’t switched fully on, collector current is forwardGain × base current', () => {
    // 10 µA into the base, 10 V across it.
    const { result, gain } = gainAt(10, 10e-6);
    expect(result.converged).toBe(true);
    expect(gain).toBeCloseTo(PN2222A.forwardGain, 2);
  });

  it('has the DC current gain the datasheet promises at each of its test currents (VCE = 10 V)', () => {
    // KSP2222A, hFE at VCE = 10 V: at least 35 at 0.1 mA, 50 at 1 mA, 75 at 10 mA, 100 to 300 at 150 mA, 40 at
    // 500 mA. The model's gain doesn't fall off at high current as a real one does (see the README's
    // simplifications), so it's inside every limit with room to spare.
    for (const [collectorAmps, min, max] of [
      [0.1e-3, 35, Infinity],
      [1e-3, 50, Infinity],
      [10e-3, 75, Infinity],
      [150e-3, 100, 300],
      [500e-3, 40, Infinity],
    ] as const) {
      const { result, gain } = gainAt(10, collectorAmps / PN2222A.forwardGain);
      expect(result.converged, `${String(collectorAmps)} A`).toBe(true);
      expect(gain, `${String(collectorAmps)} A`).toBeGreaterThanOrEqual(min);
      expect(gain, `${String(collectorAmps)} A`).toBeLessThanOrEqual(max);
    }
  });

  it('switched fully on, drops no more than the datasheet’s saturation voltages', () => {
    // KSP2222A: VCE(sat) at most 0.3 V and VBE(on) 0.6 to 1.2 V at IC = 150 mA, IB = 15 mA; at most 1.0 V and
    // 2.0 V at IC = 500 mA, IB = 50 mA.
    for (const [collectorAmps, baseAmps, maxVce, minVbe, maxVbe] of [
      [0.15, 0.015, 0.3, 0.6, 1.2],
      [0.5, 0.05, 1.0, 0, 2.0],
    ] as const) {
      const { c, collector, base, result } = forced(baseAmps, collectorAmps);
      expect(result.converged).toBe(true);
      const vce = c.voltage(collector);
      const vbe = c.voltage(base);
      expect(vce, `VCE(sat) at ${String(collectorAmps)} A`).toBeGreaterThan(0);
      expect(vce, `VCE(sat) at ${String(collectorAmps)} A`).toBeLessThanOrEqual(maxVce);
      expect(vbe, `VBE(sat) at ${String(collectorAmps)} A`).toBeGreaterThanOrEqual(minVbe);
      expect(vbe, `VBE(sat) at ${String(collectorAmps)} A`).toBeLessThanOrEqual(maxVbe);
      expectConserved(c);
    }
  });

  it('with its emitter open, leaks less from collector to base than the datasheet allows (ICBO, 60 V)', () => {
    // KSP2222A: ICBO at most 0.01 µA at VCB = 60 V, IE = 0. Only reverse-biased junctions: still solves.
    const c = new Circuit();
    const collector = c.node('collector');
    const emitter = c.node('emitter');
    const supply = c.add(new Source('VCB', collector, GROUND, 60));
    c.add(new Transistor('Q1', collector, GROUND, emitter));
    expect(c.step(0).converged).toBe(true);
    expect(Math.abs(c.currentThrough(supply) ?? 1)).toBeLessThan(0.01e-6);
    expectConserved(c);
  });

  it('is off with its base left open: whichever way round, one of its two diodes blocks', () => {
    for (const volts of [9, -5]) {
      const c = new Circuit();
      const collector = c.node('collector');
      const base = c.node('base'); // wired to nothing else
      const supply = c.add(new Source('V1', collector, GROUND, volts));
      c.add(new Transistor('Q1', collector, base, GROUND));
      expect(c.step(0).converged, `${String(volts)} V`).toBe(true);
      expect(Math.abs(c.currentThrough(supply) ?? 1), `${String(volts)} V`).toBeLessThan(1e-9);
      expectConserved(c);
    }
  });

  it('runs backwards, badly, with collector and emitter swapped: reverseGain × base current', () => {
    // Collector 5 V below the emitter, base fed from the emitter's side through 10 kΩ: the base-collector diode
    // is the one forward now, and the emitter acts as the collector.
    const c = new Circuit();
    const collector = c.node('collector');
    const base = c.node('base');
    const supply = c.add(new Source('V1', GROUND, collector, 5));
    const feed = c.add(new Resistor('RB', GROUND, base, 10000));
    c.add(new Transistor('Q1', collector, base, GROUND));
    expect(c.step(0).converged).toBe(true);
    const baseAmps = c.currentThrough(feed) ?? 0;
    const fromEmitter = (c.currentThrough(supply) ?? 0) - baseAmps;
    expect(fromEmitter / baseAmps).toBeCloseTo(PN2222A.reverseGain, 2);
    expectConserved(c);
  });

  it('switches a load: under a milliamp into the base turns on tens of milliamps, with little left across it', () => {
    // 9 V, 330 Ω on the collector, 10 kΩ into the base.
    const c = new Circuit();
    const supply = c.node('supply');
    const collector = c.node('collector');
    const base = c.node('base');
    c.add(new Source('V1', supply, GROUND, 9));
    const load = c.add(new Resistor('RL', supply, collector, 330));
    const feed = c.add(new Resistor('RB', supply, base, 10000));
    c.add(new Transistor('Q1', collector, base, GROUND));
    expect(c.step(0).converged).toBe(true);
    const baseAmps = c.currentThrough(feed) ?? 0;
    const collectorAmps = c.currentThrough(load) ?? 0;
    expect(baseAmps).toBeLessThan(1e-3);
    expect(collectorAmps).toBeGreaterThan(20e-3);
    expect(c.voltage(collector)).toBeLessThan(0.3);
    expect(collectorAmps / baseAmps).toBeLessThan(PN2222A.forwardGain); // saturated: the load sets the current
    expectConserved(c);
  });

  it('settles at every base voltage from off to fully on, from a cold start each time', () => {
    for (let volts = 0; volts <= 1.2; volts += 0.05) {
      const c = new Circuit();
      const supply = c.node('supply');
      const collector = c.node('collector');
      const base = c.node('base');
      c.add(new Source('V1', supply, GROUND, 9));
      c.add(new Source('VB', base, GROUND, volts));
      c.add(new Resistor('RL', supply, collector, 330));
      c.add(new Transistor('Q1', collector, base, GROUND));
      expect(c.step(0).converged, `${volts.toFixed(2)} V`).toBe(true);
      expectConserved(c);
    }
  });

  it('reports the heat it makes: collector volts × amps, plus base volts × amps', () => {
    const { c, q, collectorAmps } = gainAt(5, 100e-6);
    const r = readingsFrom(c);
    const expected = 5 * collectorAmps + r.voltage(q.base) * q.baseCurrent(r);
    expect(c.powerOf(q)).toBeCloseTo(expected, 9);
  });
});

/** The circuit's readings after a solve. */
function readingsFrom(c: Circuit): Readings {
  return {
    time: c.time,
    dt: TICK,
    ambient: c.ambient,
    voltage: (node) => c.voltage(node),
    across: (a, b) => c.across(a, b),
    branchCurrent: () => 0,
  };
}

if (!diodesWritten) {
  it.todo('Transistor.diodes, job 1: the two diodes');
}
if (!actionWritten) {
  it.todo('Transistor.action, job 2: the transistor action');
}
if (!currentWritten) {
  it.todo('Transistor.current, job 3: the collector current');
}
