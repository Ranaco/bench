/**
 * A motor's kick on the board: anything sudden from the page (a button let go) is followed in small steps, so the
 * transistor sees the kick and keeps it for the Inspector.
 */
import { PN2222A } from '@bench/engine';
import { describe, expect, it } from 'vitest';
import { addWire, EMPTY_BOARD } from '../builder/board';
import { place } from '../builder/fixtures';
import { BoardSim } from '.';

describe('A motor switched off from the board', () => {
  it('kicks the transistor when a push button lets go of its base', () => {
    // Battery + → motor → collector, emitter → battery −; battery + → 1 kΩ → button → base.
    const battery = place(EMPTY_BOARD, 'battery');
    const motor = place(battery.board, 'motor');
    const q = place(motor.board, 'transistor');
    const feed = place(q.board, 'resistor', 0, 0, { ohms: 1000 });
    const button = place(feed.board, 'button');
    let board = button.board;
    board = addWire(board, { part: battery.id, pin: 'plus' }, { part: motor.id, pin: 'plus' });
    board = addWire(board, { part: motor.id, pin: 'minus' }, { part: q.id, pin: 'collector' });
    board = addWire(board, { part: q.id, pin: 'emitter' }, { part: battery.id, pin: 'minus' });
    board = addWire(board, { part: battery.id, pin: 'plus' }, { part: feed.id, pin: 'a' });
    board = addWire(board, { part: feed.id, pin: 'b' }, { part: button.id, pin: 'a' });
    board = addWire(board, { part: button.id, pin: 'b' }, { part: q.id, pin: 'base' });
    const sim = new BoardSim();
    sim.sync(board);
    sim.press(button.id, true);
    sim.press(motor.id, true); // held: its full current, for the biggest kick
    for (let i = 0; i < 18; i++) sim.step(1 / 60);
    expect(sim.getSnapshot().parts[q.id]?.transistor?.highestVolts).toBeLessThan(1);
    sim.press(button.id, false);
    sim.step(1 / 60);
    expect(sim.getSnapshot().parts[q.id]?.transistor?.highestVolts).toBeGreaterThan(PN2222A.maxCollectorVolts);
  });
});
