/**
 * An ESP32 in a circuit, running a program: your GPIO pin, Bench's chip and the program runner together. These wait
 * for all three of your pin's jobs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Circuit, Esp32, Gpio, Machine, NotWrittenYet, ProgramRunner, Resistor, Switch, TACT_SWITCH, type Node, type Program, type Stamp } from '../../src/index';
import {
  analogRead,
  delay,
  digitalRead,
  digitalWrite,
  HIGH,
  INPUT,
  INPUT_PULLDOWN,
  LOW,
  millis,
  OUTPUT,
  pinMode,
  Serial,
} from '../../src/program/arduino';
import { isWritten, Source } from '../fixtures';

const gpioWritten = (() => {
  const pin = new Gpio('U1', 1 as Node, 2 as Node, 3 as Node);
  const readings = { time: 0, dt: 0.001, ambient: 25, voltage: () => 0, across: () => 0, branchCurrent: () => 0 };
  return (
    isWritten(() => {
      pin.stamp({ time: 0, dt: 0.001, ambient: 25, internal: () => 1 as Node, conductance: () => undefined, currentSource: () => undefined, voltageSource: () => 0 as never, junction: () => undefined, controlledCurrent: () => undefined });
    }) &&
    isWritten(() => pin.read(0, 0)) &&
    isWritten(() => pin.current(readings))
  );
})();

/** An ESP32 on its own: 3V3, GND, and GPIO 2, 4 and 34, running `program`. */
function board(program: Program) {
  const c = new Circuit();
  const vdd = c.node('3V3');
  const gnd = c.node('GND');
  const pins = { 2: c.node('GPIO2'), 4: c.node('GPIO4'), 34: c.node('GPIO34') };
  const chip = c.add(new Esp32('U1', vdd, gnd, pins));
  const machine = new Machine(c, chip, new ProgramRunner(program), { 34: 1 });
  return { c, vdd, gnd, pins, chip, machine };
}

/** Steps `machine` in frames of `frame` seconds until `seconds` have passed. */
async function run(machine: Machine, seconds: number, frame = 1 / 60) {
  for (let t = 0; t < seconds - 1e-9; t += frame) await machine.step(frame);
}

/** Blink on GPIO2, printing the time at each change. */
const BLINK: Program = {
  setup() {
    pinMode(2, OUTPUT);
  },
  async loop() {
    digitalWrite(2, HIGH);
    Serial.println(`on ${String(millis())}`);
    await delay(500);
    digitalWrite(2, LOW);
    Serial.println(`off ${String(millis())}`);
    await delay(500);
  },
};

describe.runIf(gpioWritten)('An ESP32 running a program', () => {
  it('blinks: the pin goes HIGH and LOW every 500 ms of the circuit’s time', async () => {
    const { c, gnd, pins, machine } = board(BLINK);
    c.add(new Resistor('R1', pins[2], gnd, 330));
    await run(machine, 0.25);
    expect(c.across(pins[2], gnd)).toBeCloseTo((3.3 * 330) / (330 + 16.5), 6); // HIGH, through the driver's 16.5 Ω
    await run(machine, 0.5);
    expect(c.across(pins[2], gnd)).toBeCloseTo(0, 6);
    await run(machine, 1.4);
    expect(machine.serial).toBe('on 2\noff 502\non 1002\noff 1502\non 2002\n'); // setup() at 1 ms, loop() from 2
    expect(machine.failure).toBeUndefined();
  });

  it('prints the same and ends the same at any frame rate', async () => {
    const ends: string[] = [];
    for (const frame of [1 / 30, 1 / 60, 1 / 240]) {
      const { c, gnd, pins, machine } = board(BLINK);
      c.add(new Resistor('R1', pins[2], gnd, 330));
      await run(machine, 2.2, frame);
      ends.push(`${machine.serial}|${c.across(pins[2], gnd).toFixed(9)}|${c.time.toFixed(3)}`);
    }
    expect(new Set(ends).size).toBe(1);
  });

  it('never runs the program on a solve that doesn’t move time on', async () => {
    const { c, machine } = board(BLINK);
    for (let i = 0; i < 10; i++) c.step(0);
    await machine.step(0);
    expect(machine.serial).toBe('');
  });

  it('reads a button: could be either with nothing to hold the pin, firm with a pull-down', async () => {
    const reads: number[] = [];
    let mode: typeof INPUT | typeof INPUT_PULLDOWN = INPUT;
    const { c, vdd, gnd, pins, machine } = board({
      setup() {
        pinMode(4, mode);
      },
      loop() {
        reads.push(digitalRead(4));
      },
    });
    const button = c.add(new Switch('BTN', vdd, pins[4], false, TACT_SWITCH));
    await run(machine, 0.01);
    expect(machine.snapshot(0).pins[4]?.level).toBe('unknown'); // 100 MΩ of insulation: 50 nA could move it 5 V
    expect(machine.floating.length).toBeGreaterThan(0);

    mode = INPUT_PULLDOWN;
    const pulled = board({
      setup() {
        pinMode(4, mode);
      },
      loop() {
        reads.push(digitalRead(4));
      },
    });
    const pulledButton = pulled.c.add(new Switch('BTN', pulled.vdd, pulled.pins[4], false, TACT_SWITCH));
    await run(pulled.machine, 0.01);
    expect(pulled.machine.snapshot(0).pins[4]?.level).toBe('low');
    pulledButton.closed = true;
    await run(pulled.machine, 0.01);
    expect(pulled.machine.snapshot(0).pins[4]?.level).toBe('high');
    expect(pulled.machine.floating).toEqual([]);
    expect(button.closed).toBe(false);
    expect(gnd).toBeDefined();
  });

  it('can’t read a pin fed from a supply that doesn’t share the chip’s ground, until they’re joined', () => {
    const { c, gnd, pins, machine } = board(BLINK);
    const plus = c.node('plus');
    const minus = c.node('minus');
    c.add(new Source('B1', plus, minus, 3));
    c.add(new Resistor('R1', plus, pins[4], 1000));
    c.step(0);
    expect(machine.snapshot(0).pins[4]?.level).toBe('unknown');
    c.add(new Resistor('J', minus, gnd, 0.01)); // a wire from its − to the chip's GND
    c.step(0);
    expect(machine.snapshot(0).pins[4]?.level).toBe('high');
  });

  it('reads the knob’s voltage as a number: half of 3.3 V is about 1870', async () => {
    const { c, vdd, gnd, pins, machine } = board({
      async loop() {
        Serial.println(analogRead(34));
        await delay(1000);
      },
    });
    c.add(new Resistor('R1', vdd, pins[34], 10000));
    c.add(new Resistor('R2', pins[34], gnd, 10000));
    await run(machine, 0.01);
    const value = Number(machine.serial.trim());
    expect(value).toBeGreaterThan(1865);
    expect(value).toBeLessThan(1875);
  });

  it('stops a program that goes wrong, says why, and keeps the circuit going', async () => {
    const { c, machine } = board({
      loop() {
        digitalWrite(9, LOW);
      },
    });
    await run(machine, 0.1);
    expect(String(machine.failure)).toMatch(/GPIO9 isn’t one of this board’s pins/);
    expect(c.time).toBeCloseTo(0.1, 9);
  });
});

if (!gpioWritten) it.todo('An ESP32 running a program: needs your GPIO pin, in packages/engine/src/lesson-6-microcontroller/gpio.ts');

/**
 * Whatever's in your pin, the program waits for all three of its jobs. Here they're stood in for (a plain 1 MΩ to GND,
 * reading LOW: nothing like the real pin) so only current() is missing, then not.
 */
describe('A part-written pin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('holds the program back until current() is written too, and names it', async () => {
    vi.spyOn(Gpio.prototype, 'stamp').mockImplementation(function (this: Gpio, s: Stamp) {
      s.conductance(this.pin, this.gnd, 1e-6);
    });
    vi.spyOn(Gpio.prototype, 'read').mockReturnValue('low');
    const current = vi.spyOn(Gpio.prototype, 'current').mockImplementation(function (this: Gpio) {
      throw new NotWrittenYet(this.name, 'gpio.ts');
    });
    let started = 0;
    const { machine } = board({
      setup() {
        started++;
      },
      async loop() {
        await delay(100);
      },
    });
    await run(machine, 0.05);
    expect(started).toBe(0);
    expect(machine.unwritten().map((m) => m.method)).toEqual(['current']);

    current.mockReturnValue(0);
    await run(machine, 0.05);
    expect(machine.unwritten()).toEqual([]);
    expect(started).toBe(1);
    expect(machine.failure).toBeUndefined();
  });
});
