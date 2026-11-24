/**
 * The ESP32 on the board: its program ending cleanly when the board changes under it, and a pin nothing holds
 * (floating) counting towards nothing, and an LED switched faster than a frame glowing at its average.
 */
import { adcReading, arduino, DEFAULTS, Gpio, NotWrittenYet, ProgramMistake, ProgramRunner, type ProgramTransport, type Stamp, type Writes } from '@bench/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addWire, EMPTY_BOARD, removePart } from './board';
import { ESP32_ADC } from '../kinds/esp32/board';
import { gpioWritten, partOf, place, run } from './fixtures';
import { BoardSim } from '../sim';

/** A program that's always partway through: each step waits on it until it's stopped, as a worker's does. */
class Partway implements ProgramTransport {
  stops = 0;
  resumes = 0;
  private abandon: ((error: Error) => void) | undefined;

  due(): boolean {
    return true;
  }

  resume(): Promise<Writes> {
    this.resumes++;
    return new Promise<Writes>((_, reject) => {
      this.abandon = reject;
    });
  }

  stop(): void {
    this.stops++;
    this.abandon?.(new ProgramMistake('Your program was stopped.'));
  }
}

/**
 * A BoardSim whose every ESP32 runs a Partway program, and the programs it's made. Its parts are built from Bench's
 * defaults, so the stand-ins below (on Gpio, the default pin) are what its ESP32 runs.
 */
function partwaySim() {
  const programs: Partway[] = [];
  const sim = new BoardSim(
    () => {
      const program = new Partway();
      programs.push(program);
      return program;
    },
    () => DEFAULTS,
  );
  return { sim, programs };
}

describe('An ESP32 taken off the board while its program is partway through', () => {
  // Your pin's jobs stood in for (a plain 1 MΩ to GND, reading LOW: nothing like the real pin), so the program runs
  // whatever's in gpio.ts. Only what happens to the program is tested here.
  beforeEach(() => {
    vi.spyOn(Gpio.prototype, 'stamp').mockImplementation(function (this: Gpio, s: Stamp) {
      s.conductance(this.pin, this.gnd, 1e-6);
    });
    vi.spyOn(Gpio.prototype, 'read').mockReturnValue('low');
    vi.spyOn(Gpio.prototype, 'current').mockReturnValue(0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stops the program at once, and the board carries on without it', async () => {
    const { sim, programs } = partwaySim();
    const chip = place(EMPTY_BOARD, 'esp32');
    sim.sync(chip.board);
    const advancing = sim.advance(0.1);
    expect(programs[0]?.resumes).toBe(1); // waiting on the program, 1 ms in

    sim.sync(EMPTY_BOARD);
    await advancing; // without the stop, this would wait forever
    expect(programs[0]?.stops).toBe(1);
    expect(programs[0]?.resumes).toBe(1);
    expect(sim.getSnapshot().program).toBeUndefined();
    expect(sim.getSnapshot().error).toBeUndefined();
  });

  it('leaves the ESP32 put in its place running, untouched by the old one stopping', async () => {
    const { sim, programs } = partwaySim();
    const first = place(EMPTY_BOARD, 'esp32');
    sim.sync(first.board);
    const advancing = sim.advance(0.1);
    const second = place(removePart(first.board, first.id), 'esp32');
    sim.sync(second.board);
    await advancing;
    expect(programs.map((p) => p.stops)).toEqual([1, 0]);

    void sim.advance(0.01);
    expect(programs[1]?.resumes).toBe(1);
    expect(sim.getSnapshot().program).toMatchObject({ chip: second.id, failure: undefined, runs: true });
    sim.sync(EMPTY_BOARD);
  });
});

describe('A part-written pin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names every job still to write, current() included, and holds the program until they are', () => {
    // stamp() stood in for (a plain 1 MΩ to GND), read() and current() not written.
    vi.spyOn(Gpio.prototype, 'stamp').mockImplementation(function (this: Gpio, s: Stamp) {
      s.conductance(this.pin, this.gnd, 1e-6);
    });
    for (const method of ['read', 'current'] as const) {
      vi.spyOn(Gpio.prototype, method).mockImplementation(function (this: Gpio) {
        throw new NotWrittenYet(this.name, 'gpio.ts');
      });
    }
    const { sim, programs } = partwaySim();
    const chip = place(EMPTY_BOARD, 'esp32');
    sim.sync(chip.board);
    void sim.advance(0.05);
    const snapshot = sim.getSnapshot();
    expect(snapshot.notWritten.map((m) => m.method).sort()).toEqual(['current', 'read']);
    expect(snapshot.program?.runs).toBe(false);
    expect(programs[0]?.resumes).toBe(0);
  });
});

describe.runIf(gpioWritten)('A pin nothing holds', () => {
  it('isn’t over, whatever voltage it drifts to', () => {
    // A 9 V battery across two inputs, GPIO4 and GPIO2, and joined to nothing else: neither pin is tied to the chip's
    // GND. In Bench they float 9 V apart, so at least one is outside −0.3 to 3.6 V. (A real chip's input protection
    // would clamp them; Bench doesn't model it: see the README's simplifications.) What's checked: floating isn't over.
    const chip = place(EMPTY_BOARD, 'esp32');
    const battery = place(chip.board, 'battery');
    let board = addWire(battery.board, { part: chip.id, pin: 'gpio4' }, { part: battery.id, pin: 'plus' });
    board = addWire(board, { part: battery.id, pin: 'minus' }, { part: chip.id, pin: 'gpio2' });
    const sim = new BoardSim();
    sim.sync(board);
    run(sim, 0.05);
    const reading = partOf(sim, chip.id);
    const pins = [reading.chip?.pins.gpio4, reading.chip?.pins.gpio2];
    expect(pins.map((pin) => pin?.floating)).toEqual([true, true]);
    expect(pins.some((pin) => (pin?.volts ?? 0) > 3.6 || (pin?.volts ?? 0) < -0.3)).toBe(true);
    expect(reading.over).toBe(false);
  });

  it('adds nothing to an analog pin’s range, and leaves a gap in its trace', () => {
    const chip = place(EMPTY_BOARD, 'esp32');
    const knob = place(chip.board, 'knob', 0, 0, { turn: 0.5 });
    const loose = addWire(knob.board, { part: knob.id, pin: 'wiper' }, { part: chip.id, pin: 'gpio34' });
    const sim = new BoardSim();
    sim.sync(loose);
    run(sim, 0.2);
    const pin = () => partOf(sim, chip.id).chip?.pins.gpio34;
    expect(pin()?.floating).toBe(true);
    expect(pin()?.analogRange).toBeUndefined();
    expect(sim.pinTrace(chip.id, 'gpio34')?.volts.every(Number.isNaN)).toBe(true);

    // Its track across 3V3 and GND: the wiper holds the pin, and the range is the one reading it gives, steady.
    let board = addWire(loose, { part: chip.id, pin: 'v3' }, { part: knob.id, pin: 'a' });
    board = addWire(board, { part: knob.id, pin: 'b' }, { part: chip.id, pin: 'gnd' });
    sim.sync(board);
    run(sim, 0.2);
    expect(pin()?.floating).toBe(false);
    const unit = ESP32_ADC[34];
    if (unit === undefined) throw new Error('GPIO34 is an analog pin');
    const reads = adcReading(pin()?.volts ?? Number.NaN, unit);
    expect(pin()?.analogRange).toEqual([reads, reads]);
  });
});

if (!gpioWritten) {
  it.todo('Floating ESP32 pins: needs your GPIO pin, in packages/engine/src/lesson-6-microcontroller/gpio.ts');
}

/** GPIO2 → 330 Ω → LED → GND, with GPIO2 switched every 2 ms, running on this thread. */
function fastBlink() {
  const chip = place(EMPTY_BOARD, 'esp32');
  const r = place(chip.board, 'resistor', 0, 0, { ohms: 330 });
  const led = place(r.board, 'led');
  let board = addWire(led.board, { part: chip.id, pin: 'gpio2' }, { part: r.id, pin: 'a' });
  board = addWire(board, { part: r.id, pin: 'b' }, { part: led.id, pin: 'anode' });
  board = addWire(board, { part: led.id, pin: 'cathode' }, { part: chip.id, pin: 'gnd' });
  const sim = new BoardSim(
    () =>
      new ProgramRunner({
        setup() {
          arduino.pinMode(2, arduino.OUTPUT);
        },
        async loop() {
          arduino.digitalWrite(2, arduino.HIGH);
          await arduino.delay(2);
          arduino.digitalWrite(2, arduino.LOW);
          await arduino.delay(2);
        },
      }),
  );
  sim.sync(board);
  return { sim, chip: chip.id, led: led.id };
}

describe.runIf(gpioWritten)('An LED switched faster than the screen draws', () => {
  it('glows steady at its average, half as much at 2 ms on and 2 ms off, not on and off at random', async () => {
    const { sim, led } = fastBlink();
    for (let frame = 0; frame < 30; frame++) await sim.advance(1 / 60);
    const glows: number[] = [];
    const instants: number[] = [];
    for (let frame = 0; frame < 30; frame++) {
      await sim.advance(1 / 60);
      const reading = partOf(sim, led);
      glows.push(reading.glowAmps ?? 0);
      instants.push(reading.amps ?? 0);
    }
    const on = Math.max(...instants); // what it carries while GPIO2 is HIGH
    expect(Math.min(...instants)).toBeLessThan(1e-6); // the moment itself still flips between on and off…
    // …but a 16.7 ms frame is about half on: a little more or less, by where the 2 ms halves fall in it.
    for (const glow of glows) {
      expect(glow).toBeGreaterThan(0.4 * on);
      expect(glow).toBeLessThan(0.6 * on);
    }
  });

  it('reads in the Inspector as a multimeter does: switching, half the time HIGH, 4 times a second', async () => {
    const { sim, chip } = fastBlink();
    for (let frame = 0; frame < 30; frame++) await sim.advance(1 / 60);
    const shown = new Set<unknown>();
    for (let frame = 0; frame < 30; frame++) {
      await sim.advance(1 / 60);
      const readout = partOf(sim, chip).chip?.readout;
      shown.add(readout);
      const pin = readout?.pins.gpio2;
      expect(pin?.switches).toBeGreaterThanOrEqual(2);
      expect(pin?.highShare).toBeGreaterThan(0.4);
      expect(pin?.highShare).toBeLessThan(0.6);
    }
    expect(shown.size).toBeLessThanOrEqual(3); // half a second: two or three readouts, not thirty
  });
});
