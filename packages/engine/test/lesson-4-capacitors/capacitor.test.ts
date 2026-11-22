/**
 * Tests for your capacitor (packages/engine/src/lesson-4-capacitors/capacitor.ts).
 * Each job's tests show as "todo" until that job stops throwing NotWrittenYet,
 * then they start checking; the ones that run a circuit wait for all three.
 */
import { describe, expect, it } from 'vitest';
import { Capacitor, Circuit, GROUND, Resistor, TICK, type Node, type Readings } from '../../src/index';
import { expectConserved, isWritten, Source, SpyStamp } from '../fixtures';

const A = 1 as Node;
const B = 2 as Node;

/** Readings with `volts` at a and `atB` at b, as a solve would leave them. */
function readings(volts: number, atB = 0): Readings {
  const at = (node: Node) => (node === A ? volts : node === B ? atB : 0);
  return { time: 0, dt: TICK, ambient: 25, voltage: at, across: (a, b) => at(a) - at(b), branchCurrent: () => 0 };
}

const settleWritten = isWritten(() => {
  new Capacitor('C1', A, B, 1e-3).settle(readings(0), TICK);
});
const currentWritten = isWritten(() => {
  new Capacitor('C1', A, B, 1e-3).current(readings(0));
});
const stampWritten = isWritten(() => {
  new Capacitor('C1', A, B, 1e-3).stamp(new SpyStamp());
});
const allWritten = settleWritten && currentWritten && stampWritten;

describe.runIf(settleWritten)('Capacitor.settle: remembering', () => {
  it('holds the volts across it, a to b, once a tick is over', () => {
    const cap = new Capacitor('C1', A, B, 1e-3);
    expect(cap.held).toBe(0); // a new one starts empty
    cap.settle(readings(4.2, 1.2), TICK);
    expect(cap.held).toBeCloseTo(3, 12);
    cap.settle(readings(0, 2), TICK);
    expect(cap.held).toBeCloseTo(-2, 12); // charged the other way round
  });
});

describe.runIf(currentWritten)('Capacitor.current: farads × change in volts ÷ time', () => {
  it('flows in while its voltage rises, out while it falls, and not at all while it holds', () => {
    const cap = new Capacitor('C1', A, B, 1e-3); // 1000 µF
    cap.held = 1;
    // Up 0.5 V in a thousandth of a second: 1000 µF × 0.5 V ÷ 0.001 s = 0.5 A.
    expect(cap.current(readings(1.5))).toBeCloseTo(0.5, 12);
    expect(cap.current(readings(0.9))).toBeCloseTo(-0.1, 12);
    expect(cap.current(readings(1))).toBe(0);
  });
});

/** A source charging a capacitor through a resistor: the classic RC circuit. */
function rc(volts: number, ohms: number, farads: number) {
  const c = new Circuit();
  const top = c.node('top');
  const plate = c.node('plate');
  const source = c.add(new Source('V1', top, GROUND, volts));
  const resistor = c.add(new Resistor('R1', top, plate, ohms));
  const cap = c.add(new Capacitor('C1', plate, GROUND, farads));
  return { c, top, plate, source, resistor, cap };
}

describe.runIf(allWritten)('Capacitor in a circuit', () => {
  it('fills through a resistor tick by tick, exactly as the arithmetic says', () => {
    // 9 V through 1 kΩ into 1000 µF. Each tick, what's left to fill shrinks by 1 / (1 + dt ÷ RC): the same
    // sum the solver does, so this should agree to the last few digits.
    const { c, cap, resistor } = rc(9, 1000, 1e-3);
    const shrink = 1 / (1 + TICK / (1000 * 1e-3));
    for (let tick = 1; tick <= 300; tick++) {
      c.step(TICK);
      expect(cap.held).toBeCloseTo(9 * (1 - shrink ** tick), 7);
      // Every amp through the resistor goes into the capacitor.
      expect(c.currentThrough(cap)).toBeCloseTo(c.currentThrough(resistor) ?? Number.NaN, 9);
      expectConserved(c);
    }
  });

  it('is 63 % full after R × C seconds, like the smooth curve says, to within a tick’s worth', () => {
    const { c, cap } = rc(9, 1000, 1e-3); // R × C = 1 s
    c.step(1);
    expect(cap.held / 9).toBeCloseTo(1 - Math.exp(-1), 3);
    c.step(4);
    expect(cap.held / 9).toBeCloseTo(1 - Math.exp(-5), 3); // all but 0.7 %
  });

  it('starts by letting the full current through, then less and less', () => {
    const { c, cap } = rc(9, 1000, 1e-3);
    c.step(TICK);
    const first = c.currentThrough(cap) ?? 0;
    expect(first).toBeCloseTo((9 / 1000) * (1 / (1 + TICK / 1)), 9); // nearly 9 V ÷ 1 kΩ
    c.step(1);
    expect(c.currentThrough(cap)).toBeLessThan(first * 0.4);
  });

  it('keeps its charge with nothing connected, and gives it back through a resistor', () => {
    const { c, plate, source, resistor, cap } = rc(9, 1000, 1e-3);
    c.step(10); // all but a whisker full
    const full = cap.held;
    c.remove(source);
    c.remove(resistor);
    c.step(2);
    // Floating: nowhere for the charge to go but the solver's 1 pS from each node to ground (GMIN), a few
    // billionths over 2 s.
    expect(cap.held / full).toBeCloseTo(1, 7);
    const drain = c.add(new Resistor('R2', plate, GROUND, 1000));
    c.step(1); // one R × C
    expect(cap.held / full).toBeCloseTo(Math.exp(-1), 3);
    expect(c.currentThrough(cap)).toBeLessThan(0); // flowing out of a: discharging
    expect(c.currentThrough(drain)).toBeCloseTo(-(c.currentThrough(cap) ?? 0), 9);
    expectConserved(c);
  });

  it('starts empty, even on nodes another part used before', () => {
    const { c, top, plate, resistor, cap } = rc(9, 1000, 1e-3);
    c.step(10);
    c.remove(resistor);
    c.remove(cap);
    c.release(plate);
    const reused = c.node('again'); // the same node number, last seen at 9 V
    const fresh = c.add(new Capacitor('C2', reused, GROUND, 1e-3));
    c.add(new Resistor('R2', top, reused, 1000));
    expect(fresh.held).toBe(0);
    c.step(TICK);
    expect(fresh.held).toBeCloseTo(9 * (1 - 1 / (1 + TICK)), 7); // one tick's worth, from empty
  });
});

if (!settleWritten) it.todo('Capacitor.settle: write it first, in packages/engine/src/lesson-4-capacitors/capacitor.ts');
if (!currentWritten) it.todo('Capacitor.current: next');
if (!stampWritten) it.todo('Capacitor.stamp: last, and then it joins the circuit');
