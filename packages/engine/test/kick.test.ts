/**
 * A coil switched off: the kick. A coil's current can't stop at once, so when its path opens, the voltage across it
 * leaps until something lets the current through. That happens in far less than a tick, so after anything sudden
 * (a pin written, a part added or taken away) a board with something fast on it takes the next tick in small steps.
 */
import { describe, expect, it } from 'vitest';
import {
  Battery,
  Circuit,
  DEFAULTS,
  ENERGIZER_522,
  Electrolytic,
  Esp32,
  GROUND,
  Led,
  Machine,
  PN2222A,
  ProgramRunner,
  Resistor,
  Supply,
  Transistor,
  UVR_25V,
  type Node,
  type Part,
  type Program,
  type Readings,
  type Stamp,
} from '../src/index';
import { delay, digitalWrite, HIGH, LOW, OUTPUT, pinMode } from '../src/program/arduino';

/** A coil: `henries` in series with `ohms`, stepped by backward Euler. Fast: its current can change within a tick. */
class Coil implements Part {
  readonly fast = true;
  amps = 0;
  constructor(
    readonly name: string,
    readonly a: Node,
    readonly b: Node,
    readonly henries: number,
    readonly ohms: number,
  ) {}
  private conductance(dt: number) {
    return 1 / (this.ohms + this.henries / dt);
  }
  stamp(s: Stamp): void {
    const g = this.conductance(s.dt);
    s.conductance(this.a, this.b, g);
    s.currentSource(this.a, this.b, g * (this.henries / s.dt) * this.amps);
  }
  current(r: Readings): number {
    return this.conductance(r.dt) * (r.across(this.a, this.b) + (this.henries / r.dt) * this.amps);
  }
  settle(r: Readings): void {
    this.amps = this.current(r);
  }
}

/** Faulhaber 1516 T 009 SR's winding (datasheet edition 2026 Jul. 28): 229 µH and 32.5 Ω. */
const HENRIES = 229e-6;
const OHMS = 32.5;

/**
 * The 9 V battery feeding the coil into a transistor's collector, its emitter to ground, its base through 1 kΩ from
 * `drive` (3.3 V). Options: a diode across the coil, a 2200 µF capacitor across the battery.
 */
function board(options: { diode?: boolean; capacitor?: boolean; firstStep?: number } = {}) {
  const c = new Circuit();
  if (options.firstStep !== undefined) c.firstStep = options.firstStep;
  const plus = c.node('plus');
  const collector = c.node('collector');
  const base = c.node('base');
  const pin = c.node('pin');
  c.add(new Battery('B1', plus, GROUND, ENERGIZER_522.volts, ENERGIZER_522.ohms));
  const coil = c.add(new Coil('L1', plus, collector, HENRIES, OHMS));
  const q = c.add(new Transistor('Q1', collector, base, GROUND));
  c.add(new Resistor('R1', pin, base, 1000));
  const drive = c.add(new Supply('V1', pin, GROUND, 3.3));
  // A diode for the coil's current to go round in: an LED is one, with a bigger drop.
  if (options.diode) c.add(new Led('D1', collector, plus));
  if (options.capacitor) c.add(new Electrolytic('C1', plus, GROUND, UVR_25V[2200], DEFAULTS.capacitor));
  return { c, coil, q, drive, plus, collector };
}

/** Runs `b` steady, switches the transistor off at once, and gives the highest collector volts over the tick after. */
function switchOff(b: ReturnType<typeof board>, sudden = true) {
  b.c.step(0.3);
  const before = b.coil.amps;
  b.q.takeHighest();
  b.drive.volts = 0;
  if (sudden) b.c.changed();
  const result = b.c.step(0.001);
  return { before, highest: b.q.takeHighest(), after: b.coil.amps, result };
}

describe('A coil switched off', () => {
  it('kicks the transistor’s collector up to where it breaks down, its 40 V rating', () => {
    const kick = switchOff(board());
    expect(kick.before).toBeGreaterThan(0.25); // the coil was carrying its current
    expect(kick.result.converged).toBe(true);
    expect(kick.highest).toBeGreaterThan(PN2222A.maxCollectorVolts);
    expect(kick.highest).toBeLessThan(PN2222A.maxCollectorVolts + 0.5); // a little past it at 0.27 A, not 10 mA
    expect(Math.abs(kick.after)).toBeLessThan(1e-9); // and the current's gone
  });

  it('peaks the same however small the first step is: the steps follow it, they don’t set it', () => {
    // At 10 ns the coil's current has barely fallen by the end of the first step; smaller changes the peak by less
    // than a millivolt.
    const peaks = [1e-8, 3e-9, 1e-9].map((firstStep) => switchOff(board({ firstStep })).highest);
    for (const peak of peaks) expect(peak).toBeCloseTo(peaks[0] ?? 0, 2);
  });

  it('would be missed in one step of a whole tick: why a sudden change is followed in small ones', () => {
    expect(switchOff(board(), false).highest).toBeLessThan(ENERGIZER_522.volts + 0.1);
  });

  it('stays near the battery with a diode across the coil: its current goes round through the diode', () => {
    const kick = switchOff(board({ diode: true }));
    expect(kick.result.converged).toBe(true);
    expect(kick.highest).toBeGreaterThan(ENERGIZER_522.volts);
    expect(kick.highest).toBeLessThan(ENERGIZER_522.volts + 5); // the battery plus the diode's drop, at 0.27 A
  });

  it('keeps its books with a big capacitor beside it, at the smallest steps', () => {
    for (const diode of [false, true]) {
      const b = board({ capacitor: true, diode, firstStep: 1e-9 });
      const kick = switchOff(b);
      expect(kick.result.converged).toBe(true);
      const audit = b.c.audit();
      expect(audit.worstNodeAmps).toBeLessThan(1e-9);
      expect(audit.powerImbalance).toBeLessThan(1e-9);
    }
  });

  it('breaks down at its rating: 40 V at 10 mA with the base open, the datasheet’s test', () => {
    const c = new Circuit();
    const collector = c.node('collector');
    const base = c.node('base');
    // 10 mA pushed into the collector, the base left open.
    const push: Part = {
      name: 'I1',
      stamp: (s) => {
        s.currentSource(GROUND, collector, PN2222A.breakdownAmps);
      },
      current: () => PN2222A.breakdownAmps,
    };
    c.add(push);
    c.add(new Transistor('Q1', collector, base, GROUND));
    c.step(0);
    expect(c.voltage(collector)).toBeCloseTo(PN2222A.maxCollectorVolts, 2);
  });
});

describe('Small steps', () => {
  it('follow a program’s pin write: the kick when it switches the transistor off', async () => {
    const c = new Circuit();
    const vdd = c.node('3V3');
    const gnd = c.node('GND');
    const gpio2 = c.node('GPIO2');
    const plus = c.node('plus');
    const collector = c.node('collector');
    const base = c.node('base');
    const chip = c.add(new Esp32('U1', vdd, gnd, { 2: gpio2 }));
    c.add(new Battery('B1', plus, gnd, ENERGIZER_522.volts, ENERGIZER_522.ohms));
    c.add(new Coil('L1', plus, collector, HENRIES, OHMS));
    const q = c.add(new Transistor('Q1', collector, base, gnd));
    c.add(new Resistor('R1', gpio2, base, 1000));
    const program: Program = {
      setup() {
        pinMode(2, OUTPUT);
      },
      async loop() {
        digitalWrite(2, HIGH);
        await delay(300);
        digitalWrite(2, LOW);
        await delay(300);
      },
    };
    const machine = new Machine(c, chip, new ProgramRunner(program));
    await machine.step(0.25);
    q.takeHighest();
    await machine.step(0.1); // past 300 ms, when the pin goes LOW
    expect(q.takeHighest()).toBeGreaterThan(PN2222A.maxCollectorVolts);
  });

  it('leave a board with nothing fast on it exactly as it was', () => {
    const run = (sudden: boolean) => {
      const b = board();
      b.c.remove(b.coil);
      b.c.add(new Resistor('RL', b.plus, b.collector, OHMS));
      const volts: number[] = [];
      for (let ms = 0; ms < 200; ms++) {
        if (ms % 7 === 0) {
          b.drive.volts = b.drive.volts > 0 ? 0 : 3.3;
          if (sudden) b.c.changed();
        }
        b.c.step(0.001);
        volts.push(b.c.voltage(b.collector));
      }
      return volts;
    };
    expect(run(true)).toEqual(run(false));
  });
});
