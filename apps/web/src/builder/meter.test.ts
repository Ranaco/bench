import { ENERGIZER_522, JUMPER, awgArea, conductorOhms } from '@bench/engine';
import { describe, expect, it } from 'vitest';
import { removeWire, splitWire } from './board';
import { ledLoop } from './fixtures';
import { afterSplits, liveTarget, measure, METER_START, type MeterState } from './meter';
import { BoardSim } from './sync';

function running(ohms: number) {
  const loop = ledLoop(ohms);
  const sim = new BoardSim();
  sim.sync(loop.board);
  return { ...loop, sim, read: (meter: MeterState) => measure(meter, loop.board, sim.getSnapshot()) };
}

describe('the meter', () => {
  it('reads the voltage across the LED, red on its anode and black on its cathode', () => {
    const loop = running(330);
    const reading = loop.read({
      mode: 'volts',
      leads: { red: { kind: 'pin', pin: { part: loop.led, pin: 'anode' } }, black: { kind: 'pin', pin: { part: loop.led, pin: 'cathode' } } },
    });
    expect(typeof reading).toBe('object');
    if (typeof reading === 'string') return;
    expect(reading.value).toBeCloseTo(2.04, 2);
    expect(reading.what).toBe('Red on D1 anode (+), black on D1 cathode (−).');
  });

  it('reads negative with the leads swapped, like a real meter', () => {
    const loop = running(330);
    const reading = loop.read({
      mode: 'volts',
      leads: { red: { kind: 'pin', pin: { part: loop.led, pin: 'cathode' } }, black: { kind: 'pin', pin: { part: loop.led, pin: 'anode' } } },
    });
    if (typeof reading === 'string') throw new Error(reading);
    expect(reading.value).toBeCloseTo(-2.04, 2);
  });

  it('reads part of the way along a wire as that share of the voltage lost along it', () => {
    const loop = running(330);
    const wire = loop.board.wires[0].id; // battery + to the resistor, carrying about 22 mA
    const along = (t: number) => {
      const reading = loop.read({ mode: 'volts', leads: { red: { kind: 'wire', wire, t }, black: { kind: 'wire', wire, t: 0 } } });
      if (typeof reading === 'string') throw new Error(reading);
      return reading.value;
    };
    const amps = 0.022;
    const lost = amps * conductorOhms(JUMPER.conductor, JUMPER.lengthMetres, awgArea(JUMPER.gauge), 25);
    expect(-along(1)).toBeCloseTo(lost, 5); // the far end is lower: current flows downhill
    expect(along(0.5)).toBeCloseTo(along(1) / 2, 12);
  });

  it('reads the battery without any ground: a voltmeter only needs two points', () => {
    const loop = running(330);
    const floating = removeWire(loop.board, loop.board.wires[3].id); // the wire to ground
    const sim = new BoardSim();
    sim.sync(floating);
    const reading = measure(
      {
        mode: 'volts',
        leads: { red: { kind: 'pin', pin: { part: loop.battery, pin: 'plus' } }, black: { kind: 'pin', pin: { part: loop.battery, pin: 'minus' } } },
      },
      floating,
      sim.getSnapshot(),
    );
    if (typeof reading === 'string') throw new Error(reading);
    // Its push less what 22 mA costs inside it.
    expect(reading.value).toBeCloseTo(ENERGIZER_522.volts - 0.022 * ENERGIZER_522.ohms, 2);
  });

  it('reads the current along a wire with the clamp', () => {
    const loop = running(330);
    const reading = loop.read({ mode: 'amps', leads: { clamp: { kind: 'wire', wire: loop.board.wires[1].id, t: 0.5 } } });
    if (typeof reading === 'string') throw new Error(reading);
    expect(reading.value).toBeCloseTo(0.022, 3);
    expect(reading.unit).toBe('A');
  });

  it('says what to do while a lead is still in its socket', () => {
    const loop = running(330);
    expect(loop.read(METER_START)).toMatch(/Drag the red and black leads/);
    expect(loop.read({ mode: 'amps', leads: {} })).toMatch(/clamp/);
  });

  it('moves a lead onto the half of a wire it was on when the wire is cut', () => {
    const loop = running(330);
    const wire = loop.board.wires[1].id;
    const cut = splitWire(loop.board, { wire, at: { x: 0, y: 0 }, t: 0.5, axis: 'h', heading: 'right' });
    if (!cut) throw new Error('no split');
    expect(afterSplits({ kind: 'wire', wire, t: 0.75 }, [cut.split])).toEqual({ kind: 'wire', wire: cut.split.halves[1], t: 0.5 });
    expect(afterSplits({ kind: 'wire', wire, t: 0.25 }, [cut.split])).toEqual({ kind: 'wire', wire: cut.split.halves[0], t: 0.5 });
    // A lead on the old wire id has nothing to touch any more.
    expect(liveTarget(cut.board, { kind: 'wire', wire, t: 0.5 })).toBeUndefined();
  });
});
