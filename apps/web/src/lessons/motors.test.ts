/**
 * Lesson 7, Motors, played the way a learner would: each step's board, built and run, ticks that step, with Bench's
 * own motor.
 */
import { arduino, DEFAULTS, FAULHABER_1516_009SR as MOTOR, Motor, PN2222A, ProgramRunner, type Program, type Readings, type Stamp } from '@bench/engine';
import { describe, expect, it } from 'vitest';
import { addWire, EMPTY_BOARD, type Board } from '../builder/board';
import { place } from '../builder/fixtures';
import { METER_START } from '../builder/meter';
import { BoardSim } from '../sim';
import { MOTORS } from './lessons';
import { advance, currentStep } from './progress';

const stepOf = (done: ReadonlySet<string>) => currentStep(MOTORS, done)?.id;

/** Plays Lesson 7 against `board` for `seconds`, checking each frame as the page does; `each` runs before every frame. */
async function play(sim: BoardSim, board: Board, seconds: number, done: ReadonlySet<string> = new Set(), each?: (t: number) => void) {
  sim.sync(board);
  let progress = done;
  for (let t = 0; t < seconds; t += 1 / 60) {
    each?.(t);
    await sim.advance(1 / 60);
    progress = advance(MOTORS, progress, { board, snapshot: sim.getSnapshot(), meter: METER_START });
  }
  return progress;
}

/** The 9 V battery straight across a motor. */
function batteryAndMotor() {
  const battery = place(EMPTY_BOARD, 'battery');
  const motor = place(battery.board, 'motor');
  let board = addWire(motor.board, { part: battery.id, pin: 'plus' }, { part: motor.id, pin: 'plus' });
  board = addWire(board, { part: motor.id, pin: 'minus' }, { part: battery.id, pin: 'minus' });
  return { board, motor: motor.id };
}

/** GPIO5 on for `onMs`, off for `offMs`, over and over. */
const pulse = (onMs: number, offMs: number): Program => ({
  setup() {
    arduino.pinMode(5, arduino.OUTPUT);
  },
  async loop() {
    arduino.digitalWrite(5, arduino.HIGH);
    await arduino.delay(onMs);
    arduino.digitalWrite(5, arduino.LOW);
    await arduino.delay(offMs);
  },
});

/**
 * The ESP32 switching the motor through the transistor: GPIO5 → 1 kΩ → base, emitter → GND; battery + → motor →
 * collector; the battery's − to the ESP32's GND. With `diode`, a 1N4007 across the motor, band to its +.
 */
function switched(diode: boolean) {
  const chip = place(EMPTY_BOARD, 'esp32');
  const battery = place(chip.board, 'battery');
  const motor = place(battery.board, 'motor');
  const q = place(motor.board, 'transistor');
  const feed = place(q.board, 'resistor', 0, 0, { ohms: 1000 });
  let board = feed.board;
  board = addWire(board, { part: chip.id, pin: 'gpio5' }, { part: feed.id, pin: 'a' });
  board = addWire(board, { part: feed.id, pin: 'b' }, { part: q.id, pin: 'base' });
  board = addWire(board, { part: q.id, pin: 'emitter' }, { part: chip.id, pin: 'gnd' });
  board = addWire(board, { part: battery.id, pin: 'plus' }, { part: motor.id, pin: 'plus' });
  board = addWire(board, { part: motor.id, pin: 'minus' }, { part: q.id, pin: 'collector' });
  board = addWire(board, { part: battery.id, pin: 'minus' }, { part: chip.id, pin: 'gnd2' });
  if (diode) {
    const d = place(board, 'diode');
    board = addWire(d.board, { part: d.id, pin: 'cathode' }, { part: motor.id, pin: 'plus' });
    board = addWire(board, { part: d.id, pin: 'anode' }, { part: motor.id, pin: 'minus' });
  }
  return { board, q: q.id, motor: motor.id };
}

const running = (program: Program) => new BoardSim(() => new ProgramRunner(program));

describe('Lesson 7: Motors', () => {
  it('spins up on the battery, then draws far more held still', async () => {
    const { board, motor } = batteryAndMotor();
    const sim = new BoardSim();
    const spun = await play(sim, board, 1);
    expect(stepOf(spun)).toBe('hold');
    const turning = sim.getSnapshot().parts[motor];
    expect(turning?.motor?.rpm).toBeGreaterThan(12000);
    sim.press(motor, true);
    const held = await play(sim, board, 0.5, spun);
    expect(stepOf(held)).toBe('switch');
    expect(sim.getSnapshot().parts[motor]?.amps).toBeGreaterThan(0.25);
  });

  it('doesn’t count a motor that runs away on a small current: it has to push back', async () => {
    // Job 1 only: a winding, no back-EMF. Through 220 Ω it gets about 35 mA, enough to beat its friction and run away.
    class WindingOnly extends Motor {
      override stamp(s: Stamp): void {
        s.conductance(this.plus, this.minus, 1 / this.spec.ohms);
      }
      override current(r: Readings): number {
        return r.across(this.plus, this.minus) / this.spec.ohms;
      }
    }
    const battery = place(EMPTY_BOARD, 'battery');
    const feed = place(battery.board, 'resistor', 0, 0, { ohms: 220 });
    const motor = place(feed.board, 'motor');
    let board = addWire(motor.board, { part: battery.id, pin: 'plus' }, { part: feed.id, pin: 'a' });
    board = addWire(board, { part: feed.id, pin: 'b' }, { part: motor.id, pin: 'plus' });
    board = addWire(board, { part: motor.id, pin: 'minus' }, { part: battery.id, pin: 'minus' });

    const runaway = new BoardSim(undefined, () => ({ ...DEFAULTS, motor: WindingOnly }));
    expect(stepOf(await play(runaway, board, 1))).toBe('spin');
    const reading = runaway.getSnapshot().parts[motor.id];
    expect(reading?.motor?.rpm).toBeGreaterThan(MOTOR.noLoadRpm); // past full speed, and still going
    expect(reading?.amps).toBeLessThan(2 * MOTOR.noLoadAmps); // on less current than the step allows
  });

  it('switches it from a pin, kicks the transistor without a diode, and keeps it under its rating with one', async () => {
    const before = new Set(['spin', 'hold']);
    const bare = switched(false);
    const sim = running(pulse(1000, 1000));
    const kicked = await play(sim, bare.board, 1.2, before); // on for a second, then off
    expect(stepOf(kicked)).toBe('catch'); // switched, then kicked
    const q0 = sim.getSnapshot().parts[bare.q];
    expect(q0?.transistor?.highestVolts).toBeGreaterThan(PN2222A.maxCollectorVolts);
    expect(q0?.over).toBe(true);

    const caught = switched(true);
    const withDiode = running(pulse(1000, 1000));
    const done = await play(withDiode, caught.board, 2.5, kicked);
    expect(stepOf(done)).toBe('speed');
    const q = withDiode.getSnapshot().parts[caught.q]?.transistor;
    expect(q?.highestVolts).toBeLessThan(PN2222A.maxCollectorVolts);
  });

  it('barely slows at half on with nothing to turn, and slows once the on-time can hardly keep up with friction', async () => {
    const before = new Set(['spin', 'hold', 'switch', 'kick', 'catch']);
    const half = switched(true);
    const halfSim = running(pulse(5, 5));
    const notYet = await play(halfSim, half.board, 1.5, before);
    expect(stepOf(notYet)).toBe('speed'); // coasting through the off-time: nearly full speed
    expect(halfSim.getSnapshot().parts[half.motor]?.motor?.rpm).toBeGreaterThan(0.9 * 12900);

    for (const [on, off] of [
      [2, 8],
      [1, 9],
    ]) {
      const slow = switched(true);
      const slowSim = running(pulse(on, off));
      const done = await play(slowSim, slow.board, 2.5, before);
      expect(stepOf(done)).toBeUndefined();
      expect(slowSim.getSnapshot().parts[slow.motor]?.motor?.averageRpm).toBeLessThan(0.75 * 12900);
    }
  });

  it('counts the speed it settles at, not one it passes on the way up', async () => {
    // 3 ms on, 7 off, from rest: it passes three quarters of full speed within a quarter of a second, then settles above.
    const before = new Set(['spin', 'hold', 'switch', 'kick', 'catch']);
    const board = switched(true);
    const sim = running(pulse(3, 7));
    const after = await play(sim, board.board, 2.5, before);
    expect(stepOf(after)).toBe('speed');
    const motor = sim.getSnapshot().parts[board.motor]?.motor;
    expect(motor?.steady).toBe(true);
    expect(motor?.averageRpm).toBeGreaterThan(0.75 * 12900);
  });
});
