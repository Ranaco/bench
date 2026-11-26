/**
 * An ESP32 in a circuit, running a program: your GPIO pin, Bench's chip and the program runner together. These wait
 * for all three of your pin's jobs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Circuit, Esp32, Gpio, Machine, Machines, NotWrittenYet, ProgramRunner, Resistor, Switch, TACT_SWITCH, type Node, type Program, type Stamp } from '../../src/index';
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

/** GPIO2 switched every 2 ms: faster than a screen draws, or an eye can follow. */
const FAST: Program = {
  setup() {
    pinMode(2, OUTPUT);
  },
  async loop() {
    digitalWrite(2, HIGH);
    await delay(2);
    digitalWrite(2, LOW);
    await delay(2);
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

  it('shows each pin as the circuit was last solved with it, between ticks, even switching every 2 ms', async () => {
    const { c, gnd, pins, chip, machine } = board(FAST);
    c.add(new Resistor('R1', pins[2], gnd, 330));
    const gpio = chip.pins.get(2);
    let highs = 0;
    for (let frame = 0; frame < 60; frame++) {
      await machine.step(1 / 60);
      const volts = c.across(pins[2], gnd);
      // A frame often ends on a tick the program ran in: what it wrote waits for the next solve, so it can't show yet.
      expect(volts > 1.65).toBe(gpio?.high);
      if (gpio?.high) highs++;
    }
    expect(highs).toBeGreaterThan(10);
    expect(highs).toBeLessThan(50);
  });

  it('averages each pin over the ticks since it was last asked, as a meter does: half HIGH at 2 ms on, 2 ms off', async () => {
    const { c, gnd, pins, machine } = board(FAST);
    c.add(new Resistor('R1', pins[2], gnd, 330));
    await run(machine, 0.1);
    machine.takeAverages(); // from here
    await run(machine, 0.25);
    const averages = machine.takeAverages();
    const pin = averages?.pins.get(2);
    const on = (3.3 * 330) / (330 + 16.5); // driving HIGH into 330 Ω, through the driver's 16.5 Ω
    expect(averages?.seconds).toBeCloseTo(0.25, 2);
    expect(pin?.highShare).toBeCloseTo(0.5, 1);
    expect(pin?.volts).toBeCloseTo(on / 2, 1);
    expect(pin?.amps).toBeCloseTo(on / 330 / 2, 3);
    expect(averages?.supplyAmps).toBeCloseTo(on / 330 / 2, 3); // all of it, out of the 3V3 supply
    expect(pin?.switches).toBeGreaterThan(100); // HIGH and LOW 62 times each in 250 ms
    expect(averages?.pins.get(4)?.highShare).toBe(0); // an input never drives
    expect(machine.takeAverages()).toBeUndefined(); // no ticks since
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

describe('Two ESP32s on one circuit', () => {
  /** A blink on GPIO2 every `ms`, printing its name each time it goes HIGH. */
  const blink = (name: string, ms: number): Program => ({
    setup() {
      pinMode(2, OUTPUT);
    },
    async loop() {
      digitalWrite(2, HIGH);
      Serial.println(name);
      await delay(ms);
      digitalWrite(2, LOW);
      await delay(ms);
    },
  });

  it('runs each one’s own program, side by side, with one solve per tick for both', async () => {
    const c = new Circuit();
    const chip = (label: string) => {
      const vdd = c.node(`${label}.3V3`);
      const gnd = c.node(`${label}.GND`);
      const pin = c.node(`${label}.GPIO2`);
      const esp = c.add(new Esp32(label, vdd, gnd, { 2: pin }));
      c.add(new Resistor(`R${label}`, pin, gnd, 330));
      return { esp, gnd, pin };
    };
    const u1 = chip('U1');
    const u2 = chip('U2');
    const m1 = new Machine(c, u1.esp, new ProgramRunner(blink('one', 100)));
    const m2 = new Machine(c, u2.esp, new ProgramRunner(blink('two', 300)));
    const both = new Machines(c);
    both.add(m1);
    both.add(m2);
    let highs1 = 0;
    let highs2 = 0;
    for (let t = 0; t < 1.2; t += 0.05) {
      await both.step(0.05);
      if (c.across(u1.pin, u1.gnd) > 1.65) highs1++;
      if (c.across(u2.pin, u2.gnd) > 1.65) highs2++;
    }
    expect(m1.serial.split('\n').filter(Boolean)).toHaveLength(6); // HIGH every 200 ms for 1.2 s
    expect(m2.serial.split('\n').filter(Boolean)).toHaveLength(2); // every 600 ms
    expect(m1.serial).not.toContain('two');
    expect(highs1).toBeGreaterThan(0);
    expect(highs2).toBeGreaterThan(0);
    expect(c.time).toBeCloseTo(1.2, 3);
  });
});
