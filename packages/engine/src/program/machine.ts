import { Circuit, TICK } from '../circuit';
import type { Esp32Model } from '../models/contracts';
import { NotWrittenYet, type Node, type Unwritten } from '../types';
import { adcReading, type AdcUnit } from './adc';
import type { Snapshot, Writes } from './runner';

/** Where the program runs: Bench's own thread, or a worker. Either way: is it due, and run it against a snapshot. */
export interface ProgramTransport {
  due(millis: number): boolean;
  resume(snapshot: Snapshot): Promise<Writes>;
}

/** One pin over a stretch of ticks, as a meter would show it. */
export interface PinAverage {
  /** Average volts against the chip's GND. */
  readonly volts: number;
  /** Average amps out of the pin, by your pin's current(). */
  readonly amps: number;
  /** The share of the ticks it spent driving HIGH, 0 to 1. */
  readonly highShare: number;
  /** How many times it went between driving HIGH and not. */
  readonly switches: number;
}

/** Every pin over the ticks since the last ask, and the chip's supply over the same ticks. */
export interface Averages {
  readonly seconds: number;
  /** By GPIO number. */
  readonly pins: ReadonlyMap<number, PinAverage>;
  /** Average amps out of the 3V3 supply. */
  readonly supplyAmps: number;
}

/** A pin the program read while it could have read either way. */
export interface FloatingRead {
  readonly millis: number;
  readonly pin: number;
}

/**
 * A circuit with a microcontroller in it, running a program. Time moves in the circuit's 1 ms ticks: each tick the
 * circuit is solved first, then, if the program is due, it runs against what the pins read at that moment, and what
 * it writes (a pin set HIGH, a pull-up switched on) takes effect from the next tick. A solve that doesn't move time
 * on (an edit, a button pressed) never runs it, and neither does one that didn't settle.
 */
export class Machine {
  /** Everything the program has printed. */
  serial = '';
  /** Each read of a pin that could have gone either way. */
  readonly floating: FloatingRead[] = [];
  /** The pins the program has read with analogRead(). */
  readonly analogPins = new Set<number>();
  /** What stopped the program, once something has: a mistake, a crash. It doesn't run again. */
  failure: unknown;
  private pending = 0;
  /**
   * The program's last pinMode() and digitalWrite() calls, waiting for the next tick's solve. Made as it begins, not
   * as the program writes them, so between ticks every pin still is what the circuit was last solved with: a pin
   * just set HIGH, with the voltage from while it was LOW, would seem to push 194 mA.
   */
  private queued: Pick<Writes, 'modes' | 'levels'> = { modes: [], levels: [] };
  /** Each pin's sums over the ticks since takeAverages() last ran, by GPIO number, and how many ticks. */
  private readonly sums = new Map<number, { volts: number; amps: number; high: number; switches: number }>();
  private sampled = 0;
  private supplySum = 0;
  /** Whether each pin was driving HIGH last tick, to count its switches. */
  private readonly wasHigh = new Map<number, boolean>();

  constructor(
    readonly circuit: Circuit,
    readonly chip: Esp32Model,
    readonly program: ProgramTransport,
    /** Which converter each pin that analogRead() can read is on. */
    readonly adc: Readonly<Partial<Record<number, AdcUnit>>> = {},
  ) {}

  /**
   * The jobs on your pin still to write: until all three are, the program doesn't run. The circuit only ever calls
   * stamp(); read() and current() are tried here, so the your-turn card can name them.
   */
  unwritten(): Unwritten[] {
    const missing: Unwritten[] = this.circuit.notWritten.filter((m) => m.part === this.chip.name);
    const gpio = this.chip.pins.values().next().value;
    if (!gpio) return missing;
    const atRest = { time: 0, dt: TICK, ambient: 25, voltage: () => 0, across: () => 0, branchCurrent: () => 0 };
    for (const [method, run] of [
      ['read', () => gpio.read(0, 0)],
      ['current', () => gpio.current(atRest)],
    ] as const) {
      try {
        run();
      } catch (error) {
        if (!(error instanceof NotWrittenYet)) throw error;
        missing.push({ part: this.chip.name, method, file: error.file });
      }
    }
    return missing;
  }

  /** Advances `dt` seconds of circuit time, a tick at a time, running the program wherever it's due. */
  async step(dt: number): Promise<void> {
    this.pending += Math.max(dt, 0);
    const due = Math.floor(this.pending / TICK + 1e-9);
    this.pending = Math.max(0, this.pending - due * TICK);
    for (let i = 0; i < due; i++) {
      this.beforeTick();
      const { converged } = this.circuit.step(TICK);
      await this.afterTick(converged);
    }
  }

  /** Just before a tick's solve: the pins as the program last set them. */
  beforeTick(): void {
    this.setPins();
  }

  /** Just after a tick's solve: the pins sampled, and the program run if it's due, against what they read now. */
  async afterTick(converged: boolean): Promise<void> {
    if (!converged || this.failure !== undefined || this.unwritten().length > 0) return;
    this.sample();
    const millis = Math.round(this.circuit.time * 1000);
    if (!this.program.due(millis)) return;
    try {
      this.apply(millis, await this.program.resume(this.snapshot(millis)));
    } catch (error) {
      this.failure = error;
    }
  }

  /** What every pin reads right now, by your pin's read(), and what analogRead() would give. */
  snapshot(millis: number): Snapshot {
    const pins: Record<number, Snapshot['pins'][number]> = {};
    const analog: Record<number, number> = {};
    const gpios = [...this.chip.pins];
    // Every pin's resistance to the chip's GND, from one elimination.
    const ohmsOf = this.circuit.resistancesBetween(gpios.map(([, gpio]) => [gpio.pin, this.chip.gnd] as const));
    for (const [i, [number, gpio]] of gpios.entries()) {
      const volts = this.circuit.across(gpio.pin, this.chip.gnd);
      const ohms = ohmsOf[i] ?? Infinity;
      pins[number] = { level: gpio.read(volts, ohms), volts, inputOnly: this.chip.inputOnly.has(number) };
      const unit = this.adc[number];
      if (unit !== undefined) analog[number] = adcReading(volts, unit);
    }
    return { millis, pins, analog, supplyVolts: this.chip.spec.supplyVolts };
  }

  /**
   * Every pin's average over the ticks since this was last called, and starts again; undefined with no ticks since.
   * A pin a program switches every few milliseconds is HIGH at one moment and LOW the next: its average, like the
   * reading on a multimeter, is what can be read.
   */
  takeAverages(): Averages | undefined {
    const ticks = this.sampled;
    if (ticks === 0) return undefined;
    const pins = new Map<number, PinAverage>();
    for (const [number, sum] of this.sums) {
      pins.set(number, { volts: sum.volts / ticks, amps: sum.amps / ticks, highShare: sum.high / ticks, switches: sum.switches });
    }
    const averages = { seconds: ticks * TICK, pins, supplyAmps: this.supplySum / ticks };
    this.sums.clear();
    this.sampled = 0;
    this.supplySum = 0;
    return averages;
  }

  /** Adds the tick just solved to every pin's running sums. */
  private sample(): void {
    const c = this.circuit;
    const readings = { time: c.time, dt: TICK, ambient: c.ambient, voltage: (node: Node) => c.voltage(node), across: (a: Node, b: Node) => c.across(a, b), branchCurrent: () => 0 };
    for (const [number, gpio] of this.chip.pins) {
      const high = gpio.mode === 'output' && gpio.high;
      const sum = this.sums.get(number) ?? { volts: 0, amps: 0, high: 0, switches: 0 };
      sum.volts += c.across(gpio.pin, this.chip.gnd);
      sum.amps += gpio.current(readings);
      if (high) sum.high++;
      if (this.wasHigh.has(number) && this.wasHigh.get(number) !== high) sum.switches++;
      this.wasHigh.set(number, high);
      this.sums.set(number, sum);
    }
    this.supplySum += c.currentThrough(this.chip) ?? 0;
    this.sampled++;
  }

  /** Sets the pins as the program last asked, just before a solve. */
  private setPins(): void {
    const { modes, levels } = this.queued;
    this.queued = { modes: [], levels: [] };
    for (const [pin, mode] of modes) {
      const gpio = this.chip.pins.get(pin);
      if (gpio) gpio.mode = mode;
    }
    for (const [pin, high] of levels) {
      const gpio = this.chip.pins.get(pin);
      if (gpio) gpio.high = high;
    }
  }

  private apply(millis: number, writes: Writes): void {
    this.queued = { modes: [...this.queued.modes, ...writes.modes], levels: [...this.queued.levels, ...writes.levels] };
    // The last 20,000 characters: enough to scroll back through, without growing forever.
    this.serial = (this.serial + writes.printed).slice(-20000);
    for (const pin of writes.floating) this.floating.push({ millis, pin });
    for (const pin of writes.analog) this.analogPins.add(pin);
  }
}
