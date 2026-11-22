/**
 * Tests for your knob (packages/engine/src/lesson-3-knob/potentiometer.ts), against the
 * Bourns PTV09 datasheet. legs() is given, so its tests always run; the rest show
 * as "todo" until stamp() stops throwing NotWrittenYet, then they start checking.
 */
import { describe, expect, it } from 'vitest';
import { Battery, Circuit, ENERGIZER_522, GROUND, KNOB_10K, Led, Potentiometer, Resistor } from '../../src/index';
import { expectConserved, isWritten, Source, SpyStamp } from '../fixtures';

const written = isWritten(() => {
  const c = new Circuit();
  new Potentiometer('RV1', c.node('a'), c.node('w'), GROUND).stamp(new SpyStamp());
});

const knobAt = (turn: number) => new Potentiometer('RV1', 1 as never, 2 as never, 3 as never, turn);

describe('Potentiometer.legs (given)', () => {
  it('splits the whole track between its two legs, wherever it’s turned', () => {
    for (const turn of [0, 0.1, 0.37, 0.5, 0.9, 1]) {
      const [toA, toB] = knobAt(turn).legs();
      expect(toA + toB).toBeCloseTo(KNOB_10K.totalOhms, 9);
    }
  });

  it('halfway, the wiper is in the middle', () => {
    expect(knobAt(0.5).legs()).toEqual([5000, 5000]);
  });

  it('turned all the way, leaves the datasheet’s 500 Ω at that end, and stays there through the dead zone', () => {
    expect(knobAt(0).legs()).toEqual([500, 9500]);
    expect(knobAt(0.03).legs()).toEqual([500, 9500]);
    expect(knobAt(1).legs()).toEqual([9500, 500]);
    expect(knobAt(0.97).legs()).toEqual([9500, 500]);
  });

  it('slides evenly in between: a linear taper', () => {
    const at = (turn: number) => knobAt(turn).legs()[0];
    expect(at(0.3) - at(0.2)).toBeCloseTo(at(0.8) - at(0.7), 9);
  });
});

/** A knob with its ends across an exact voltage, and its wiper loaded or not. */
function divider(volts: number, turn: number, load?: number) {
  const c = new Circuit();
  const top = c.node('top');
  const wiper = c.node('wiper');
  c.add(new Source('V1', top, GROUND, volts));
  const knob = c.add(new Potentiometer('RV1', top, wiper, GROUND, turn));
  const resistor = load === undefined ? undefined : c.add(new Resistor('R1', wiper, GROUND, load));
  c.step(0);
  return { c, knob, wiper, resistor };
}

// Answers are to the nanovolt and nanoamp: the solver ties every node to ground through a millionth of a millionth
// of a siemens, which moves a 10 kΩ divider by a few billionths of a volt.
describe.runIf(written)('Potentiometer', () => {
  it('across a battery, its wiper reads the battery’s share of the leg below it', () => {
    for (const turn of [0, 0.25, 0.5, 0.75, 1]) {
      const { c, knob, wiper } = divider(9, turn);
      const [, toB] = knob.legs();
      expect(c.voltage(wiper)).toBeCloseTo((9 * toB) / KNOB_10K.totalOhms, 7);
      expectConserved(c);
    }
  });

  it('measures current from a into the wiper: 9 V along 10 kΩ is 0.9 mA', () => {
    const { c, knob } = divider(9, 0.5);
    expect(c.currentThrough(knob)).toBeCloseTo(9 / KNOB_10K.totalOhms, 10);
  });

  it('keeps every node balanced with milliamps in both legs at once', () => {
    // A 1 kΩ load on the wiper: current comes down the top leg and splits, part to the load, part down the bottom leg.
    const { c, knob, resistor } = divider(9, 0.3, 1000);
    if (!resistor) throw new Error('no load');
    const [toA, toB] = knob.legs();
    const down = c.across(knob.wiper, knob.b) / toB;
    expect(c.currentThrough(knob)).toBeCloseTo((c.currentThrough(resistor) ?? 0) + down, 10);
    expect(c.currentThrough(knob) ?? 0).toBeGreaterThan(1e-3);
    expect(c.powerOf(knob)).toBeCloseTo((c.currentThrough(knob) ?? 0) ** 2 * toA + down ** 2 * toB, 10);
    expectConserved(c);
  });

  it('dims an LED as it’s turned: the more track in the loop, the less current', () => {
    const amps = [0, 0.5, 1].map((turn) => {
      const c = new Circuit();
      const plus = c.node('plus');
      const mid = c.node('mid');
      const wiper = c.node('wiper');
      c.add(new Battery('B1', plus, GROUND, ENERGIZER_522.volts, ENERGIZER_522.ohms));
      c.add(new Resistor('R1', plus, mid, 330));
      c.add(new Potentiometer('RV1', mid, wiper, c.node('spare'), turn));
      const led = c.add(new Led('D1', wiper, GROUND));
      c.step(0);
      expectConserved(c);
      return c.currentThrough(led) ?? 0;
    });
    expect(amps[0]).toBeGreaterThan(amps[1]);
    expect(amps[1]).toBeGreaterThan(amps[2]);
  });
});

if (!written) {
  it.todo('Knob: yours to write in packages/engine/src/lesson-3-knob/potentiometer.ts');
}
