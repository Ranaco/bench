/** Boards for tests: the LED loop every lesson starts from, and helpers to run them. */
import { arduino, Gpio, GROUND, NotWrittenYet, ProgramRunner, TICK, type Node, type Program } from '@bench/engine';
import { EMPTY_BOARD, addPart, addWire, type Board, type PartKind } from './board';
import { CATALOG } from './catalog';
import { BoardSim } from '../sim';

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

/**
 * An ESP32 switching an LED (through 330 Ω) from GPIO2, on this thread: on for `onMs`, off for `offMs`, over and over.
 * `wire` is the one from the resistor to the LED.
 */
export function pwmBoard(onMs: number, offMs: number) {
  const chip = place(EMPTY_BOARD, 'esp32');
  const resistor = place(chip.board, 'resistor', 0, 0, { ohms: 330 });
  const led = place(resistor.board, 'led');
  let board = addWire(led.board, { part: chip.id, pin: 'gpio2' }, { part: resistor.id, pin: 'a' });
  board = addWire(board, { part: resistor.id, pin: 'b' }, { part: led.id, pin: 'anode' });
  const wire = board.wires.at(-1)?.id ?? '';
  board = addWire(board, { part: led.id, pin: 'cathode' }, { part: chip.id, pin: 'gnd2' });
  const program: Program = {
    setup() {
      arduino.pinMode(2, arduino.OUTPUT);
    },
    async loop() {
      arduino.digitalWrite(2, arduino.HIGH);
      await arduino.delay(onMs);
      arduino.digitalWrite(2, arduino.LOW);
      await arduino.delay(offMs);
    },
  };
  const sim = new BoardSim(() => new ProgramRunner(program));
  sim.sync(board);
  return { sim, board, chip: chip.id, resistor: resistor.id, led: led.id, wire };
}

export function partOf(sim: BoardSim, id: string) {
  const reading = sim.getSnapshot().parts[id];
  if (!reading) throw new Error(`no reading for ${id}`);
  return reading;
}

export function run(sim: BoardSim, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) sim.step(1 / 60);
}

/** Lesson 6 needs your GPIO pin (packages/engine/src/lesson-6-microcontroller/gpio.ts): all three of its jobs. */
export const gpioWritten = (() => {
  const pin = new Gpio('U1', 1 as Node, 2 as Node, 3 as Node);
  pin.mode = 'pullup';
  const atRest = { time: 0, dt: TICK, ambient: 25, voltage: () => 0, across: () => 0, branchCurrent: () => 0 };
  let stamped = 0;
  try {
    pin.stamp({
      time: 0,
      dt: TICK,
      ambient: 25,
      internal: () => GROUND,
      conductance: () => {
        stamped++;
      },
      currentSource: () => undefined,
      voltageSource: () => 0 as never,
      junction: () => undefined,
      controlledCurrent: () => undefined,
    });
    pin.read(0, 0);
    pin.current(atRest);
    return stamped > 0;
  } catch (error) {
    if (error instanceof NotWrittenYet) return false;
    throw error;
  }
})();
