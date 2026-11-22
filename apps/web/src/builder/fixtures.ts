/** Boards for tests: the LED loop every lesson starts from, and helpers to run them. */
import { EMPTY_BOARD, addPart, addWire, type Board, type PartKind } from './board';
import { CATALOG } from './catalog';
import type { BoardSim } from './sync';

export function place(board: Board, kind: PartKind, x = 0, y = 0, props = CATALOG[kind].defaults) {
  return addPart(board, kind, x, y, props);
}

/** Battery → resistor → LED → back to the battery, with the battery's minus grounded. */
export function ledLoop(ohms: number) {
  let board = EMPTY_BOARD;
  const battery = place(board, 'battery');
  board = battery.board;
  const resistor = place(board, 'resistor', 0, 0, { ohms });
  board = resistor.board;
  const led = place(board, 'led');
  board = led.board;
  const ground = place(board, 'ground');
  board = ground.board;
  board = addWire(board, { part: battery.id, pin: 'plus' }, { part: resistor.id, pin: 'a' });
  board = addWire(board, { part: resistor.id, pin: 'b' }, { part: led.id, pin: 'anode' });
  board = addWire(board, { part: led.id, pin: 'cathode' }, { part: battery.id, pin: 'minus' });
  board = addWire(board, { part: battery.id, pin: 'minus' }, { part: ground.id, pin: 'pin' });
  return { board, battery: battery.id, resistor: resistor.id, led: led.id, ground: ground.id };
}

export function partOf(sim: BoardSim, id: string) {
  const reading = sim.getSnapshot().parts[id];
  if (!reading) throw new Error(`no reading for ${id}`);
  return reading;
}

export function run(sim: BoardSim, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) sim.step(1 / 60);
}

