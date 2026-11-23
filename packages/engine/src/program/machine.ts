import { Circuit, TICK } from '../circuit';
import type { Esp32 } from '../parts/esp32';
import { NotWrittenYet, type Unwritten } from '../types';
import { adcReading, type AdcUnit } from './adc';
import type { Snapshot, Writes } from './runner';

/** Where the program runs: Bench's own thread, or a worker. Either way: is it due, and run it against a snapshot. */
export interface ProgramTransport {
  due(millis: number): boolean;
  resume(snapshot: Snapshot): Promise<Writes>;
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

  constructor(
    readonly circuit: Circuit,
    readonly chip: Esp32,
    readonly program: ProgramTransport,
    /** Which converter each pin that analogRead() can read is on. */
    readonly adc: Readonly<Partial<Record<number, AdcUnit>>> = {},
  ) {}

  /** The jobs on your pin that stop the program running: its stamp(), its read() (current() only shows readings). */
  unwritten(): Unwritten[] {
    const missing: Unwritten[] = this.circuit.notWritten.filter((m) => m.part === this.chip.name);
    const gpio = this.chip.pins.values().next().value;
    if (!gpio) return missing;
    try {
      gpio.read(0, 0);
    } catch (error) {
      if (!(error instanceof NotWrittenYet)) throw error;
      missing.push({ part: this.chip.name, method: 'read', file: error.file });
    }
    return missing;
  }

  /** Advances `dt` seconds of circuit time, a tick at a time, running the program wherever it's due. */
  async step(dt: number): Promise<void> {
    this.pending += Math.max(dt, 0);
    const due = Math.floor(this.pending / TICK + 1e-9);
    this.pending = Math.max(0, this.pending - due * TICK);
    for (let i = 0; i < due; i++) {
      const { converged } = this.circuit.step(TICK);
      if (!converged || this.failure !== undefined || this.unwritten().length > 0) continue;
      const millis = Math.round(this.circuit.time * 1000);
      if (!this.program.due(millis)) continue;
      try {
        this.apply(millis, await this.program.resume(this.snapshot(millis)));
      } catch (error) {
        this.failure = error;
      }
    }
  }

  /** What every pin reads right now, by your pin's read(), and what analogRead() would give. */
  snapshot(millis: number): Snapshot {
    const pins: Record<number, Snapshot['pins'][number]> = {};
    const analog: Record<number, number> = {};
    for (const [number, gpio] of this.chip.pins) {
      const volts = this.circuit.across(gpio.pin, this.chip.gnd);
      const ohms = this.circuit.resistanceBetween(gpio.pin, this.chip.gnd);
      pins[number] = { level: gpio.read(volts, ohms), volts, inputOnly: this.chip.inputOnly.has(number) };
      const unit = this.adc[number];
      if (unit !== undefined) analog[number] = adcReading(volts, unit);
    }
    return { millis, pins, analog, supplyVolts: this.chip.spec.supplyVolts };
  }

  private apply(millis: number, writes: Writes): void {
    for (const [pin, mode] of writes.modes) {
      const gpio = this.chip.pins.get(pin);
      if (gpio) gpio.mode = mode;
    }
    for (const [pin, high] of writes.levels) {
      const gpio = this.chip.pins.get(pin);
      if (gpio) gpio.high = high;
    }
    // The last 20,000 characters: enough to scroll back through, without growing forever.
    this.serial = (this.serial + writes.printed).slice(-20000);
    for (const pin of writes.floating) this.floating.push({ millis, pin });
    for (const pin of writes.analog) this.analogPins.add(pin);
  }
}
