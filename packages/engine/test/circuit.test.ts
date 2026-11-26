import { describe, expect, it } from 'vitest';
import {
  Battery,
  Circuit,
  GROUND,
  NotWrittenYet,
  Resistor,
  Switch,
  TACT_SWITCH,
  TICK,
  Wire,
  type Part,
  type Readings,
  type Curve,
  type Node,
  type Stamp,
} from '../src/index';
import { expectConserved, FixedCurrent, Source, TestDiode, THERMAL_VOLTS } from './fixtures';

describe('Circuit, linear parts', () => {
  it('splits voltage across a divider the way hand maths says', () => {
    // 9 V across 1 kΩ then 2 kΩ: the middle sits at 9 × 2k / 3k = 6 V.
    const c = new Circuit();
    const top = c.node('top');
    const mid = c.node('mid');
    c.add(new Source('V1', top, GROUND, 9));
    c.add(new Resistor('R1', top, mid, 1000));
    c.add(new Resistor('R2', mid, GROUND, 2000));

    expect(c.step(0).converged).toBe(true);
    expect(c.voltage(top)).toBeCloseTo(9, 6);
    expect(c.voltage(mid)).toBeCloseTo(6, 6);
    expectConserved(c);
  });

  it('carries the same current through every part of a series loop', () => {
    const c = new Circuit();
    const top = c.node('top');
    const mid = c.node('mid');
    const source = c.add(new Source('V1', top, GROUND, 5));
    const r1 = c.add(new Resistor('R1', top, mid, 220));
    const r2 = c.add(new Resistor('R2', mid, GROUND, 330));
    c.step(0);

    const expected = 5 / 550;
    expect(c.currentThrough(r1)).toBeCloseTo(expected, 9);
    expect(c.currentThrough(r2)).toBeCloseTo(expected, 9);
    expect(c.currentThrough(source)).toBeCloseTo(expected, 9);
    expectConserved(c);
  });

  it('pushes a fixed current through a resistor', () => {
    const c = new Circuit();
    const top = c.node('top');
    c.add(new FixedCurrent('I1', GROUND, top, 0.002));
    c.add(new Resistor('R1', top, GROUND, 1000));
    c.step(0);
    expect(c.voltage(top)).toBeCloseTo(2, 6);
    expectConserved(c);
  });

  it('shares current between parallel paths by conductance', () => {
    // 6 V across 100 Ω and 300 Ω in parallel: 60 mA + 20 mA.
    const c = new Circuit();
    const top = c.node('top');
    const source = c.add(new Source('V1', top, GROUND, 6));
    const r1 = c.add(new Resistor('R1', top, GROUND, 100));
    const r2 = c.add(new Resistor('R2', top, GROUND, 300));
    c.step(0);
    expect(c.currentThrough(r1)).toBeCloseTo(0.06, 9);
    expect(c.currentThrough(r2)).toBeCloseTo(0.02, 9);
    expect(c.currentThrough(source)).toBeCloseTo(0.08, 9);
    expectConserved(c);
  });

  it('leaves a node connected to nothing at 0 V instead of failing', () => {
    const c = new Circuit();
    const top = c.node('top');
    const floating = c.node('floating');
    c.add(new Source('V1', top, GROUND, 5));
    c.add(new Resistor('R1', top, GROUND, 100));

    expect(c.step(0).converged).toBe(true);
    expect(c.voltage(floating)).toBe(0);
    expectConserved(c);
  });

  it('reads 0 V before the first solve', () => {
    const c = new Circuit();
    expect(c.voltage(c.node('a'))).toBe(0);
  });
});

describe('Circuit, power', () => {
  it('reports the heat in a resistor as I²R and the battery as the supplier', () => {
    const c = new Circuit();
    const plus = c.node('plus');
    const battery = c.add(new Battery('B1', plus, GROUND, 9, 1.5));
    const load = c.add(new Resistor('R1', plus, GROUND, 100));
    c.step(0);

    const amps = 9 / 101.5;
    expect(c.powerOf(load)).toBeCloseTo(amps * amps * 100, 9);
    // The battery delivers to the load, so its own net power is the load's, negative.
    expect(c.powerOf(battery)).toBeCloseTo(-c.powerOf(load), 9);
    expectConserved(c);
  });
});

describe('Circuit, junctions', () => {
  /** Solves (V - v) / R = Is·(e^(v/Vt) - 1) by bisection, independently of the engine. */
  function diodeVolts(volts: number, ohms: number, saturationAmps: number): number {
    let low = 0;
    let high = volts;
    for (let i = 0; i < 200; i++) {
      const v = (low + high) / 2;
      const mismatch = (volts - v) / ohms - saturationAmps * Math.expm1(v / THERMAL_VOLTS);
      if (mismatch > 0) low = v;
      else high = v;
    }
    return (low + high) / 2;
  }

  function diodeCircuit(volts: number, ohms: number) {
    const c = new Circuit();
    const top = c.node('top');
    const anode = c.node('anode');
    const source = c.add(new Source('V1', top, GROUND, volts));
    c.add(new Resistor('R1', top, anode, ohms));
    const diode = c.add(new TestDiode('D1', anode, GROUND));
    return { c, anode, source, diode };
  }

  it('finds a diode operating point that matches an independent solution', () => {
    const { c, anode } = diodeCircuit(5, 1000);
    expect(c.step(0).converged).toBe(true);
    expect(c.voltage(anode)).toBeCloseTo(diodeVolts(5, 1000, 1e-14), 8);
    expectConserved(c);
  });

  it('settles from a cold start even when pushed hard', () => {
    const { c, anode } = diodeCircuit(24, 10);
    expect(c.step(0).converged).toBe(true);
    expect(c.voltage(anode)).toBeCloseTo(diodeVolts(24, 10, 1e-14), 8);
    expectConserved(c);
  });

  it('settles in a few guesses once warm', () => {
    const { c } = diodeCircuit(5, 1000);
    c.step(0);
    expect(c.step(0).iterations).toBeLessThanOrEqual(3);
  });

  it('follows a change in the circuit', () => {
    const { c, anode, source } = diodeCircuit(5, 1000);
    c.step(0);
    source.volts = 12;
    expect(c.step(0).converged).toBe(true);
    expect(c.voltage(anode)).toBeCloseTo(diodeVolts(12, 1000, 1e-14), 8);
    expectConserved(c);
  });

  it('blocks current in reverse', () => {
    const { c, diode } = diodeCircuit(-5, 1000);
    c.step(0);
    expect(Math.abs(c.currentThrough(diode) ?? Number.NaN)).toBeLessThan(1e-13);
    expectConserved(c);
  });

  it('names the part when its curve returns nonsense', () => {
    const c = new Circuit();
    const a = c.node('a');
    c.add(new Source('V1', a, GROUND, 1));
    c.add({
      name: 'BROKEN',
      stamp: (s: Stamp) => {
        s.junction(a, GROUND, { current: () => Number.NaN, slope: () => 1 });
      },
      current: () => 0,
    } satisfies Part);
    expect(() => c.step(0)).toThrow(/BROKEN\.stamp\(\) failed: current\(\) is NaN/);
  });
});

describe('Circuit, controlled currents', () => {
  /** A current from `from` to `to`, set by the voltage from `plus` to `minus` through `curve`. */
  class Steered implements Part {
    constructor(
      readonly name: string,
      readonly from: Node,
      readonly to: Node,
      readonly plus: Node,
      readonly minus: Node,
      readonly curve: Curve,
    ) {}

    stamp(s: Stamp): void {
      s.controlledCurrent(this.from, this.to, this.plus, this.minus, this.curve);
    }

    current(r: Readings): number {
      return this.curve.current(r.across(this.plus, this.minus));
    }
  }

  it('draws a current set by a voltage elsewhere, and none from the nodes that set it', () => {
    // 2 mA per volt, steered by 1.5 V: 3 mA drawn through 1 kΩ from 5 V leaves 2 V.
    const c = new Circuit();
    const supply = c.node('supply');
    const drawn = c.node('drawn');
    const steer = c.node('steer');
    c.add(new Source('V1', supply, GROUND, 5));
    c.add(new Resistor('R1', supply, drawn, 1000));
    const control = c.add(new Source('V2', steer, GROUND, 1.5));
    const linear: Curve = { current: (v) => 0.002 * v, slope: () => 0.002 };
    c.add(new Steered('G1', drawn, GROUND, steer, GROUND, linear));
    expect(c.step(0).converged).toBe(true);
    expect(c.voltage(drawn)).toBeCloseTo(2, 8); // GMIN's picoamps to ground shift it by a few nanovolts
    expect(Math.abs(c.currentThrough(control) ?? 1)).toBeLessThan(1e-9);
    expectConserved(c);
  });

  it('copies a diode’s current exactly when it shares the diode’s voltage: a current mirror', () => {
    // A junction and a controlled current with the same curve across the same two nodes share one guess, so the
    // copy settles on the diode's own current rather than on a guess a step behind it.
    const diode = new TestDiode('D1', 1 as Node, GROUND);
    class Mirror implements Part {
      readonly name = 'Q1';
      constructor(
        readonly anode: Node,
        readonly out: Node,
      ) {}

      stamp(s: Stamp): void {
        s.junction(this.anode, GROUND, diode.curve);
        s.controlledCurrent(this.out, GROUND, this.anode, GROUND, diode.curve);
      }

      current(r: Readings): number {
        return diode.curve.current(r.voltage(this.anode));
      }
    }
    for (const amps of [1e-6, 1e-3, 0.1]) {
      const c = new Circuit();
      const anode = c.node('anode');
      const supply = c.node('supply');
      const out = c.node('out');
      c.add(new FixedCurrent('I1', GROUND, anode, amps));
      c.add(new Source('V1', supply, GROUND, 10));
      const load = c.add(new Resistor('R1', supply, out, 1));
      c.add(new Mirror(anode, out));
      expect(c.step(0).converged, `${String(amps)} A`).toBe(true);
      // Plus GMIN's 1e-12 S to ground at the 10 V output: 10 pA on top of the copy.
      expect(Math.abs((c.currentThrough(load) ?? 0) - amps), `${String(amps)} A`).toBeLessThan(1e-9 * amps + 2e-11);
      expectConserved(c);
    }
  });

  it('settles from a cold start with the steering voltage far past the knee', () => {
    const c = new Circuit();
    const steer = c.node('steer');
    const out = c.node('out');
    c.add(new Source('V1', steer, GROUND, 0.9));
    c.add(new Resistor('R1', steer, out, 1e6));
    const diode = new TestDiode('D1', steer, GROUND);
    c.add(new Steered('G1', out, GROUND, steer, GROUND, diode.curve));
    const result = c.step(0);
    expect(result.converged).toBe(true);
    expectConserved(c);
  });
});

describe('Circuit, resistance between two nodes', () => {
  /** A 3.3 V supply between two nodes, neither of them ground: a chip's 3V3 and GND on a board with no ground symbol. */
  function chip() {
    const c = new Circuit();
    const vdd = c.node('3V3');
    const gnd = c.node('GND');
    const pin = c.node('pin');
    c.add(new Source('REG', vdd, gnd, 3.3));
    return { c, vdd, gnd, pin };
  }

  it('measures a pull-up between a pin and the chip’s own ground, on a board with no ground symbol', () => {
    const { c, vdd, gnd, pin } = chip();
    c.add(new Resistor('RPU', pin, vdd, 45000));
    c.step(0);
    expect(c.resistanceBetween(pin, gnd) / 45000).toBeCloseTo(1, 6);
    // Measured from the solver's ground instead, the whole floating board lifts with the pin: no use for a pin.
    expect(c.resistanceBetween(pin, GROUND)).toBeGreaterThan(1e10);
  });

  it('sees an open button’s insulation, and nothing but the solver’s leak where nothing’s wired', () => {
    const { c, vdd, gnd, pin } = chip();
    c.add(new Switch('BTN', vdd, pin, false, TACT_SWITCH));
    c.step(0);
    // 100 MΩ of insulation, in parallel with the solver's 1 TΩ leaks: within about 1 %.
    expect(c.resistanceBetween(pin, gnd) / TACT_SWITCH.openOhms).toBeCloseTo(1, 1);
    const alone = c.node('nothing');
    c.step(0);
    expect(c.resistanceBetween(alone, gnd)).toBeGreaterThan(1e11);
  });

  it('counts a battery as its internal resistance, and a pair of nodes as one when they are the same', () => {
    const c = new Circuit();
    const plus = c.node('plus');
    c.add(new Battery('B1', plus, GROUND, 9, 1.75));
    c.step(0);
    expect(c.resistanceBetween(plus, GROUND)).toBeCloseTo(1.75, 6);
    expect(c.resistanceBetween(plus, plus)).toBe(0);
  });

  it('is infinite before anything’s been solved', () => {
    const c = new Circuit();
    expect(c.resistanceBetween(c.node('a'), GROUND)).toBe(Infinity);
  });
});

describe('Circuit, parts hanging by leakage', () => {
  it('settles a diode with half-built wiring hanging off it and no ground anywhere', () => {
    // Mid-build: a battery, a diode on its minus, and from the diode's anode a resistor and wires
    // leading nowhere. Nothing but the solver's leakage to ground sets where that dangling chain sits,
    // so the diode carries picoamps, and its voltage can only be pinned down to a fraction of a millivolt.
    const c = new Circuit();
    const plus = c.node('plus');
    const minus = c.node('minus');
    const cathode = c.node('cathode');
    const anode = c.node('anode');
    const [a, b, end] = [c.node('a'), c.node('b'), c.node('end')];
    c.add(new Battery('B1', plus, minus, 9.35, 1.75));
    c.add(new Wire('W1', minus, cathode));
    const diode = c.add(new TestDiode('D1', anode, cathode, 1e-13, 2.8));
    c.add(new Wire('W2', anode, a));
    c.add(new Resistor('R1', a, b, 330));
    c.add(new Wire('W3', b, end));
    for (let i = 0; i < 30; i++) {
      expect(c.step(1 / 60).converged).toBe(true);
    }
    expect(Math.abs(c.currentThrough(diode) ?? Number.NaN)).toBeLessThan(1e-9);
    expectConserved(c);
  });
});

describe('Circuit, parts with bugs', () => {
  function circuitWith(part: Part) {
    const c = new Circuit();
    c.add(part);
    return c;
  }

  it('names the part and method when a part throws', () => {
    const crash = (): never => {
      throw new TypeError('x is undefined');
    };
    expect(() => circuitWith({ name: 'S1', stamp: crash, current: () => 0 }).step(0)).toThrow(
      'S1.stamp() failed: x is undefined',
    );
    const broken: Part = { name: 'C1', stamp: () => undefined, current: crash };
    expect(() => circuitWith(broken).currentThrough(broken)).toThrow('C1.current() failed: x is undefined');
    expect(() =>
      circuitWith({ name: 'T1', stamp: () => undefined, current: () => 0, settle: crash }).step(0.001),
    ).toThrow('T1.settle() failed: x is undefined');
  });

  it('names a part that never settles', () => {
    const c = new Circuit();
    const a = c.node('a');
    let flip = 1;
    c.add(new Source('V1', a, GROUND, 1));
    c.add({
      name: 'JITTER',
      stamp: (s: Stamp) => {
        s.junction(a, GROUND, { current: () => (flip = -flip) * 1e-3, slope: () => 1 });
      },
      current: () => 0,
    } satisfies Part);
    const result = c.step(0.001);
    expect(result.converged).toBe(false);
    expect(result.unsettled).toEqual(['JITTER']);
  });

  it('keeps a part in the circuit when only settle() is unwritten', () => {
    const c = new Circuit();
    const top = c.node('top');
    c.add(new Source('V1', top, GROUND, 10));
    const half: Part = {
      name: 'H1',
      stamp: (s: Stamp) => {
        s.conductance(top, GROUND, 0.01);
      },
      current: (r: Readings) => r.voltage(top) * 0.01,
      settle: () => {
        throw new NotWrittenYet('H1', 'h1.ts');
      },
    };
    c.add(half);
    c.step(0.01);
    expect(c.currentThrough(half)).toBeCloseTo(0.1, 9);
    expect(c.notWritten).toEqual([{ part: 'H1', method: 'settle', file: 'h1.ts' }]);
    expectConserved(c);
  });
});

describe('Circuit, internal nodes', () => {
  it('gives each part its own private nodes, stable across solves', () => {
    const c = new Circuit();
    const plus = c.node('plus');
    c.add(new Battery('B1', plus, GROUND, 9, 1));
    c.add(new Battery('B2', plus, GROUND, 9, 1));
    c.add(new Resistor('R1', plus, GROUND, 8));
    c.step(0);
    const first = c.voltage(plus);
    c.step(0);
    // Two 9 V cells, 1 Ω each, in parallel into 8 Ω: 9 × 8 / 8.5.
    expect(first).toBeCloseTo((9 * 8) / 8.5, 9);
    expect(c.voltage(plus)).toBe(first);
    expectConserved(c);
  });

  it('hands a part’s private nodes to its replacement', () => {
    const c = new Circuit();
    const plus = c.node('plus');
    const old = c.add(new Battery('B1', plus, GROUND, 9, 1));
    c.add(new Resistor('R1', plus, GROUND, 8));
    c.step(0);
    c.replace(old, new Battery('B1', plus, GROUND, 6, 1));
    c.step(0);
    expect(c.voltage(plus)).toBeCloseTo((6 * 8) / 9, 9);
    expectConserved(c);
  });
});

describe('Circuit, parts not written yet', () => {
  class Unwritten implements Part {
    constructor(
      readonly name: string,
      readonly a: ReturnType<Circuit['node']>,
    ) {}

    stamp(s: Stamp): void {
      // Stamps something first, so the rollback is tested too.
      s.conductance(this.a, GROUND, 1);
      throw new NotWrittenYet(this.name, 'somewhere.ts');
    }

    current(r: Readings): number {
      throw new NotWrittenYet(this.name, 'somewhere.ts');
    }
  }

  it('treats the part as absent and lists it', () => {
    const c = new Circuit();
    const top = c.node('top');
    const mid = c.node('mid');
    c.add(new Source('V1', top, GROUND, 9));
    const r1 = c.add(new Resistor('R1', top, mid, 1000));
    const missing = c.add(new Unwritten('X1', mid));

    expect(c.step(0).converged).toBe(true);
    expect(c.currentThrough(r1)).toBeCloseTo(0, 9);
    expect(c.currentThrough(missing)).toBeUndefined();
    expect(c.notWritten.map((e) => e.part)).toEqual(['X1']);
    expectConserved(c);
  });
});

describe('Circuit, time', () => {
  function clock() {
    const seen: number[] = [];
    const part: Part = {
      name: 'CLOCK',
      stamp: () => undefined,
      current: () => 0,
      settle: (_r: Readings, dt: number) => {
        seen.push(dt);
      },
    };
    return { part, seen };
  }

  it('advances in whole ticks and carries the remainder', () => {
    const c = new Circuit();
    const { part, seen } = clock();
    c.add(part);
    c.step(0.0025);
    expect(seen).toEqual([TICK, TICK]);
    c.step(0.0005);
    expect(seen).toHaveLength(3);
    expect(c.time).toBeCloseTo(0.003, 12);
  });

  it('solves without moving time on step(0)', () => {
    const c = new Circuit();
    const { part, seen } = clock();
    c.add(part);
    c.step(0);
    expect(seen).toHaveLength(0);
    expect(c.time).toBe(0);
  });

  it('gives the same answer whatever the frame rate', () => {
    function heatFor(frameSeconds: number): number {
      const c = new Circuit();
      const top = c.node('top');
      c.add(new Source('V1', top, GROUND, 9));
      const r = c.add(new Resistor('R1', top, GROUND, 100)); // 0.81 W: hot
      const frames = Math.round(5 / frameSeconds);
      for (let i = 0; i < frames; i++) c.step(frameSeconds);
      expect(c.time).toBeCloseTo(5, 9);
      return r.temperature;
    }
    const at30 = heatFor(1 / 30);
    expect(heatFor(1 / 144)).toBeCloseTo(at30, 9);
    expect(heatFor(1 / 60)).toBeCloseTo(at30, 9);
    expect(heatFor(5)).toBeCloseTo(at30, 9);
  });

  it("doesn't let parts react to a solve that didn't settle", () => {
    const c = new Circuit();
    const a = c.node('a');
    let flip = 1;
    const { part: watcher, seen } = clock();
    c.add(new Source('V1', a, GROUND, 1));
    // A curve that never gives the same answer twice can never settle.
    c.add({
      name: 'JITTER',
      stamp: (s: Stamp) => {
        s.junction(a, GROUND, {
          current: () => (flip = -flip) * 1e-3,
          slope: () => 1,
        });
      },
      current: () => 0,
    } satisfies Part);
    c.add(watcher);

    expect(c.step(0.01).converged).toBe(false);
    expect(seen).toHaveLength(0);
  });

  it('lets parts react to each tick', () => {
    const c = new Circuit();
    const { part, seen } = clock();
    c.add(part);
    c.step(0.01);
    expect(seen).toHaveLength(10);
    expect(c.time).toBeCloseTo(0.01, 12);
  });

  it('swaps a part in place', () => {
    const c = new Circuit();
    const top = c.node('top');
    c.add(new Source('V1', top, GROUND, 10));
    const old = c.add(new Resistor('R1', top, GROUND, 1000));
    const fresh = new Resistor('R1', top, GROUND, 500);
    c.replace(old, fresh);
    c.step(0);
    expect(c.currentThrough(fresh)).toBeCloseTo(0.02, 9);
    expectConserved(c);
  });
});

describe('Circuit, parts that remember', () => {
  it('tells parts how long a tick is, even on a solve that doesn’t move time on', () => {
    const c = new Circuit();
    const seen: number[] = [];
    c.add({
      name: 'WATCH',
      stamp: (s: Stamp) => {
        seen.push(s.dt);
      },
      current: (r: Readings) => {
        seen.push(r.dt);
        return 0;
      },
    } satisfies Part);
    c.step(0);
    c.step(0.003);
    expect(seen.length).toBeGreaterThan(4);
    expect(new Set(seen)).toEqual(new Set([TICK]));
  });

  it('reads each current from the solve, before the part reacts to the tick', () => {
    // A part whose current is whatever it has counted, and which counts one more each tick.
    const c = new Circuit();
    let count = 0;
    const counter: Part = {
      name: 'COUNT',
      stamp: () => undefined,
      current: () => count,
      settle: () => {
        count++;
      },
    };
    c.add(counter);
    c.step(0.001);
    expect(count).toBe(1);
    expect(c.currentThrough(counter)).toBe(0); // what it read during the tick, not after
    c.step(0);
    expect(c.currentThrough(counter)).toBe(1); // a fresh solve reads it again
  });
});

describe('Circuit, averages over time', () => {
  it('gives each part’s average current since it was last asked, then starts again', () => {
    const c = new Circuit();
    const a = c.node('a');
    const source = c.add(new FixedCurrent('I1', GROUND, a, 0.03));
    c.add(new Resistor('R1', a, GROUND, 100));
    c.step(3 * TICK); // 30 mA for three ticks…
    source.amps = 0;
    c.step(TICK); // …then nothing for one
    expect(c.averageCurrents().get(source)).toBeCloseTo(0.0225, 12);
    expect(c.averageCurrents().size).toBe(0); // no ticks since
    c.step(0); // a solve that doesn't move time on adds nothing
    expect(c.averageCurrents().size).toBe(0);
  });

  it('reads like a multimeter: each part’s current and power and each node’s voltage, averaged tick by tick', () => {
    const c = new Circuit();
    const a = c.node('a');
    const source = c.add(new FixedCurrent('I1', GROUND, a, 0.03));
    const load = c.add(new Resistor('R1', a, GROUND, 100));
    c.step(3 * TICK); // 30 mA through 100 Ω, 3 V, for three ticks…
    source.amps = 0;
    c.step(TICK); // …then nothing for one
    const readout = c.takeReadout();
    expect(readout.amps.get(load)).toBeCloseTo(0.0225, 9);
    expect(readout.volts(a)).toBeCloseTo(2.25, 9);
    expect(readout.volts(GROUND)).toBe(0);
    // 0.09 W for three ticks of four: the power's average, not average volts × average amps (0.0506 W).
    expect(readout.watts.get(load)).toBeCloseTo(0.0675, 9);
    // And it starts again.
    const next = c.takeReadout();
    expect(next.amps.size).toBe(0);
    expect(next.volts(a)).toBeUndefined();
  });

  it('reads a part added since the last readout over its own ticks', () => {
    const c = new Circuit();
    const a = c.node('a');
    c.add(new FixedCurrent('I1', GROUND, a, 0.01));
    c.add(new Resistor('R1', a, GROUND, 100));
    c.step(2 * TICK);
    const late = c.add(new Resistor('R2', a, GROUND, 100));
    c.step(2 * TICK);
    expect(c.takeReadout().amps.get(late)).toBeCloseTo(0.005, 12);
  });

  it('averages a part added part-way over its own ticks only', () => {
    const c = new Circuit();
    const a = c.node('a');
    c.add(new FixedCurrent('I1', GROUND, a, 0.01));
    c.add(new Resistor('R1', a, GROUND, 100));
    c.step(2 * TICK);
    const late = c.add(new Resistor('R2', a, GROUND, 100));
    c.step(2 * TICK);
    expect(c.averageCurrents().get(late)).toBeCloseTo(0.005, 12); // half of 10 mA, for both of its ticks
  });
});
