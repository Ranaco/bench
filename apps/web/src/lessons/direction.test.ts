/**
 * Lesson 8, Direction, played the way a learner would: the driver wired to the ESP32 and the battery, a program on
 * its pins, and each step's board ticking that step, with Bench's own driver.
 */
import { arduino, FAULHABER_1516_009SR as MOTOR, ProgramRunner, type Program } from '@bench/engine';
import { describe, expect, it } from 'vitest';
import { addWire, EMPTY_BOARD, type Board } from '../builder/board';
import { place } from '../builder/fixtures';
import { METER_START } from '../builder/meter';
import { BoardSim } from '../sim';
import { DIRECTION } from './lessons';
import { advance, currentStep } from './progress';

const stepOf = (done: ReadonlySet<string>) => currentStep(DIRECTION, done)?.id;

/** Plays Lesson 8 against `board` for `seconds`, checking each frame as the page does. */
async function play(sim: BoardSim, board: Board, seconds: number, done: ReadonlySet<string> = new Set()) {
  sim.sync(board);
  let progress = done;
  for (let t = 0; t < seconds; t += 1 / 60) {
    await sim.advance(1 / 60);
    progress = advance(DIRECTION, progress, { board, snapshot: sim.getSnapshot(), meter: METER_START });
  }
  return progress;
}

const AIN1 = 21;
const AIN2 = 19;
const PWMA = 18;

/** One stretch of a program: the three pins' levels, held for `ms`. */
type Phase = readonly [ms: number, in1: boolean, in2: boolean, pwm: boolean];

/** A program that goes through `phases` once, then holds the last one. */
const phases = (...list: readonly Phase[]): Program => ({
  setup() {
    for (const pin of [AIN1, AIN2, PWMA]) arduino.pinMode(pin, arduino.OUTPUT);
  },
  async loop() {
    for (const [ms, in1, in2, pwm] of list) {
      arduino.digitalWrite(AIN1, in1 ? arduino.HIGH : arduino.LOW);
      arduino.digitalWrite(AIN2, in2 ? arduino.HIGH : arduino.LOW);
      arduino.digitalWrite(PWMA, pwm ? arduino.HIGH : arduino.LOW);
      await arduino.delay(ms);
    }
    list = list.slice(-1);
  },
});

/** Forward on PWMA's dimmer: `onMs` on, `offMs` off, over and over. */
const dimmed = (onMs: number, offMs: number): Program => ({
  setup() {
    for (const pin of [AIN1, AIN2, PWMA]) arduino.pinMode(pin, arduino.OUTPUT);
    arduino.digitalWrite(AIN1, arduino.HIGH);
    arduino.digitalWrite(AIN2, arduino.LOW);
  },
  async loop() {
    arduino.digitalWrite(PWMA, arduino.HIGH);
    await arduino.delay(onMs);
    arduino.digitalWrite(PWMA, arduino.LOW);
    await arduino.delay(offMs);
  },
});

/**
 * The step's circuit: the driver's left side on the ESP32 (VCC and STBY on 3V3, GND, and AIN1, AIN2 and PWMA on
 * GPIO21, 19 and 18), its right side on the 9 V battery (VM, the other GND) and the motor across AO1 and AO2.
 */
function wired() {
  const chip = place(EMPTY_BOARD, 'esp32');
  const battery = place(chip.board, 'battery');
  const motor = place(battery.board, 'motor');
  const driver = place(motor.board, 'driver');
  let board = driver.board;
  const wire = (a: string, aPin: string, b: string, bPin: string) => {
    board = addWire(board, { part: a, pin: aPin }, { part: b, pin: bPin });
  };
  wire(chip.id, 'v3', driver.id, 'vcc');
  wire(chip.id, 'v3', driver.id, 'stby');
  wire(chip.id, 'gnd', driver.id, 'gnd');
  wire(chip.id, 'gpio21', driver.id, 'ain1');
  wire(chip.id, 'gpio19', driver.id, 'ain2');
  wire(chip.id, 'gpio18', driver.id, 'pwma');
  wire(battery.id, 'plus', driver.id, 'vm');
  wire(motor.id, 'plus', driver.id, 'ao1');
  wire(motor.id, 'minus', driver.id, 'ao2');
  wire(driver.id, 'gnd2', battery.id, 'minus');
  return { board, motor: motor.id, driver: driver.id };
}

const running = (program: Program) => new BoardSim(() => new ProgramRunner(program));

describe('Lesson 8: Direction', () => {
  it('wires up, runs the motor forward, then backwards', async () => {
    const { board, motor } = wired();
    const forward = running(phases([1000, true, false, true]));
    const ahead = await play(forward, board, 1.2);
    expect(stepOf(ahead)).toBe('backwards');
    expect(forward.getSnapshot().parts[motor]?.motor?.rpm).toBeGreaterThan(0.75 * MOTOR.noLoadRpm);

    const back = running(phases([1000, false, true, true]));
    const reversed = await play(back, board, 1.2, ahead);
    expect(stepOf(reversed)).toBe('coast');
    expect(back.getSnapshot().parts[motor]?.motor?.rpm).toBeLessThan(-0.75 * MOTOR.noLoadRpm);
  });

  it('coasts with both inputs LOW, and only brakes with both HIGH, its current running backwards', async () => {
    const before = new Set(['wire', 'forward', 'backwards']);
    const { board, motor } = wired();
    const coasting = running(phases([800, true, false, true], [1000, false, false, true]));
    const coasted = await play(coasting, board, 1, before);
    expect(stepOf(coasted)).toBe('brake'); // coasting doesn't brake
    expect(coasting.getSnapshot().parts[motor]?.motor?.rpm).toBeGreaterThan(1000); // a fifth of a second on: still turning

    const braking = running(phases([800, true, false, true], [1000, true, true, true]));
    const braked = await play(braking, board, 1, coasted);
    expect(stepOf(braked)).toBe('half');
    expect(braking.getSnapshot().parts[motor]?.motor?.rpm).toBe(0); // the same fifth of a second: stopped
  });

  it('runs at about half speed on half PWM, where Lesson 7’s transistor ran at nearly full', async () => {
    const before = new Set(['wire', 'forward', 'backwards', 'coast', 'brake']);
    const { board, motor } = wired();
    const sim = running(dimmed(5, 5));
    const done = await play(sim, board, 2.5, before);
    expect(stepOf(done)).toBeUndefined();
    const average = sim.getSnapshot().parts[motor]?.motor?.averageRpm ?? 0;
    expect(average).toBeGreaterThan(0.35 * MOTOR.noLoadRpm);
    expect(average).toBeLessThan(0.65 * MOTOR.noLoadRpm);
  });

  it('doesn’t count PWM that leaves it nearly at full speed', async () => {
    const before = new Set(['wire', 'forward', 'backwards', 'coast', 'brake']);
    const { board } = wired();
    const sim = running(dimmed(9, 1));
    expect(stepOf(await play(sim, board, 2.5, before))).toBe('half');
  });
});
