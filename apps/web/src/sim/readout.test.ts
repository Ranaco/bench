/**
 * The Inspector's numbers as a meter shows them: while a program switches pins, every part, wire and pin reads its
 * average over the last quarter second, whatever the frame rate; a board with nothing switching reads as it is.
 */
import { describe, expect, it } from 'vitest';
import { ledLoop, partOf, pwmBoard, run } from '../builder/fixtures';
import { measure, type MeterState } from '../builder/meter';
import { BoardSim } from '.';

/** Runs a PWM board for a second at frames `frameMs` apart, then gives its last readout and the board. */
async function readoutOf(onMs: number, offMs: number, frameMs: number) {
  const board = pwmBoard(onMs, offMs);
  for (let t = 0; t < 1; t += frameMs / 1000) await board.sim.advance(frameMs / 1000);
  return { ...board, readout: board.sim.getSnapshot().readout };
}

describe('The Inspector, read like a multimeter', () => {
  it('reads 100 Hz PWM at half on as half the current, the same on the LED, its resistor, its wire and its pin', async () => {
    // Held on, for the full current to compare with.
    const held = pwmBoard(1000, 0);
    await held.sim.advance(0.3);
    const full = partOf(held.sim, held.led).amps ?? 0;
    expect(full).toBeGreaterThan(0.001);
    expect(held.sim.getSnapshot().readout).toBeUndefined(); // held, not switching: shown as it is

    for (const frameMs of [5.5, 7, 1000 / 60]) {
      const { readout, sim, chip, resistor, led, wire } = await readoutOf(5, 5, frameMs);
      const at = `frames ${String(frameMs)} ms apart`;
      const ledAmps = readout?.parts[led]?.amps ?? 0;
      expect(ledAmps / full, at).toBeCloseTo(0.5, 2);
      expect(readout?.parts[resistor]?.amps, at).toBeCloseTo(ledAmps, 9);
      expect(readout?.wires[wire], at).toBeCloseTo(ledAmps, 9);
      // The chip's own readout of GPIO2, over the same quarter second.
      expect(partOf(sim, chip).chip?.readout?.pins.gpio2.amps, at).toBeCloseTo(ledAmps, 6);
    }
  });

  it('averages power tick by tick: half on is half the power, not a quarter', async () => {
    const held = pwmBoard(1000, 0);
    await held.sim.advance(0.3);
    const fullWatts = partOf(held.sim, held.resistor).watts;
    const { readout, resistor } = await readoutOf(5, 5, 1000 / 60);
    expect((readout?.parts[resistor]?.watts ?? 0) / fullWatts).toBeCloseTo(0.5, 2);
  });

  it('gives the Meter window the same averages, on the clamp and on the leads', async () => {
    const meters = (chip: string, wire: string): MeterState[] => [
      { mode: 'amps', leads: { clamp: { kind: 'wire', wire, t: 0.5 } } },
      { mode: 'volts', leads: { red: { kind: 'pin', pin: { part: chip, pin: 'gpio2' } }, black: { kind: 'pin', pin: { part: chip, pin: 'gnd2' } } } },
    ];
    const read = (board: ReturnType<typeof pwmBoard>) =>
      meters(board.chip, board.wire).map((meter) => {
        const reading = measure(meter, board.board, board.sim.getSnapshot());
        if (typeof reading === 'string') throw new Error(reading);
        return reading.value;
      });
    const held = pwmBoard(1000, 0);
    await held.sim.advance(0.3);
    const [fullAmps = 0, fullVolts = 0] = read(held);
    const switching = await readoutOf(5, 5, 1000 / 60);
    const [amps = 0, volts = 0] = read(switching);
    expect(amps).toBeCloseTo(switching.readout?.wires[switching.wire] ?? -1, 12);
    expect(amps / fullAmps).toBeCloseTo(0.5, 2);
    expect(volts / fullVolts).toBeCloseTo(0.5, 2);
  });

  it('leaves a board with nothing switching as it is', () => {
    const loop = ledLoop(470);
    const sim = new BoardSim();
    sim.sync(loop.board);
    run(sim, 1);
    expect(sim.getSnapshot().readout).toBeUndefined();
  });
});
