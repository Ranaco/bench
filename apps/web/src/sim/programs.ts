/**
 * The programs running on the board's ESP32s, one per chip: starting one when a chip arrives, stopping it when the
 * chip goes, and the Inspector's multimeter-style readout of each chip's pins.
 */
import { Machine, Machines, type Averages, type Circuit, type Esp32Model, type ModuleSource, type ProgramTransport, type Unwritten } from '@bench/engine';
import { ESP32_ADC } from '../kinds/esp32/board';
import type { ChipProgram } from '../kinds/kind';
import type { ChipPin, ChipReadout, ProgramReading, ReadoutPin } from './readings';

/**
 * How Bench runs a chip's program: given the chip, its part's id and its program's code, where the program runs (a
 * worker, or for tests, right here).
 */
export type ProgramHost = (chip: Esp32Model, id: string, program: ModuleSource) => ProgramTransport & { stop?(): void };

/** Each chip's program, as code, by the chip's part id. */
export type ProgramFor = (id: string) => ModuleSource;

/** What a chip runs when nothing says otherwise: a program that does nothing. */
const NOTHING: ProgramFor = (id) => ({ text: 'export function loop(): void {}', file: `${id}.ts` });

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One chip's program, running. */
interface Running {
  readonly id: string;
  readonly chip: Esp32Model;
  readonly machine: Machine;
  readonly transport: ReturnType<ProgramHost>;
  /** The program's code it was started with. */
  readonly text: string;
  /**
   * Its last readout (see readout.ts): the program's pin averages since the one before, and what the Inspector shows
   * for it (made at the first read after).
   */
  last: { readonly averages: Averages; shown: ChipReadout | undefined } | undefined;
}

export class Programs {
  /** By the chip's part id. */
  private readonly running = new Map<string, Running>();
  private readonly machines: Machines;

  constructor(
    private readonly circuit: Circuit,
    private readonly host: ProgramHost | undefined,
    private programFor: ProgramFor = NOTHING,
  ) {
    this.machines = new Machines(circuit);
  }

  /** Each chip's program from now on: a chip whose program has changed starts it again (at the next sync). */
  setPrograms(programFor: ProgramFor): void {
    this.programFor = programFor;
    for (const [id, run] of this.running) if (programFor(id).text !== run.text) this.stop(id);
  }

  /** Whether any program is on the board, so time has to move a tick at a time to keep up with them. */
  get active(): boolean {
    return this.running.size > 0;
  }

  /** Runs a program on each chip (by part id), starting new ones and stopping those whose chip has gone or changed. */
  sync(chips: ReadonlyMap<string, Esp32Model>): void {
    for (const [id, run] of this.running) {
      if (chips.get(id) === run.chip) continue;
      this.stop(id);
    }
    if (!this.host) return;
    for (const [id, chip] of chips) {
      if (this.running.has(id)) continue;
      const program = this.programFor(id);
      const transport = this.host(chip, id, program);
      const machine = new Machine(this.circuit, chip, transport, ESP32_ADC);
      this.machines.add(machine);
      this.running.set(id, { id, chip, machine, transport, text: program.text, last: undefined });
    }
  }

  /** Stops one chip's program, so it starts afresh (with its program as it is now) at the next sync. */
  restart(id: string): void {
    this.stop(id);
  }

  private stop(id: string): void {
    const run = this.running.get(id);
    if (!run) return;
    run.transport.stop?.();
    this.machines.delete(run.machine);
    this.running.delete(id);
  }

  /** Moves the circuit on `dt` seconds a tick at a time, running every program wherever it's due. */
  async step(dt: number): Promise<void> {
    await this.machines.step(dt);
  }

  /**
   * Each program's pin averages since the last readout (taken every READOUT_SECONDS, see readout.ts). True when a
   * program switched a pin back and forth in that time: too fast to read, so the Inspector shows averages.
   */
  takeReadout(): boolean {
    let switching = false;
    for (const run of this.running.values()) {
      const averages = run.machine.takeAverages();
      run.last = averages && { averages, shown: undefined };
      if (averages && [...averages.pins.values()].some((pin) => pin.switches >= 2)) switching = true;
    }
    return switching;
  }

  /** Your pin's jobs the programs are still waiting for, once each. */
  unwritten(): readonly Unwritten[] {
    const seen = new Map<string, Unwritten>();
    for (const run of this.running.values()) {
      for (const missing of run.machine.unwritten()) seen.set(`${missing.part}.${missing.method}`, missing);
    }
    return [...seen.values()];
  }

  /** What the program running on chip `id` adds to reading it, or undefined if none is. */
  on(id: string): ChipProgram | undefined {
    const run = this.running.get(id);
    if (!run) return undefined;
    return { analogPins: run.machine.analogPins, readout: (pins, supplyAmps) => readout(run, pins, supplyAmps) };
  }

  /** Each program as the board shows it, by its chip's part id. */
  readings(): Record<string, ProgramReading> {
    const all: Record<string, ProgramReading> = {};
    for (const [id, { machine }] of this.running) {
      all[id] = {
        chip: id,
        serial: machine.serial,
        failure: machine.failure === undefined ? undefined : message(machine.failure),
        floating: machine.floating,
        runs: machine.unwritten().length === 0,
        analogPins: machine.analogPins,
      };
    }
    return all;
  }
}

/**
 * A chip's pins as the Inspector shows them: as they are now, but a pin that went both ways since the last readout is
 * shown by its averages instead, as a multimeter would show it; one that switched once is simply in its new state.
 */
function readout(run: Running, pins: Readonly<Record<string, ChipPin>>, supplyAmps: number): ChipReadout | undefined {
  const last = run.last;
  if (!last) return undefined;
  if (last.shown) return last.shown;
  const shown: Record<string, ReadoutPin> = {};
  for (const [id, pin] of Object.entries(pins)) {
    const average = last.averages.pins.get(pin.gpio);
    const highShare = average?.highShare ?? (pin.mode === 'output' && pin.high ? 1 : 0);
    const switches = average?.switches ?? 0;
    shown[id] =
      average && switches >= 2
        ? { ...pin, volts: average.volts, amps: pin.amps === undefined ? undefined : average.amps, highShare, switches }
        : { ...pin, highShare, switches };
  }
  const switching = Object.values(shown).some((pin) => pin.switches >= 2);
  last.shown = { pins: shown, supplyAmps: switching ? last.averages.supplyAmps : supplyAmps };
  return last.shown;
}
