/**
 * The board, simulated: the live circuit kept in step with the board, time moving on (with the ESP32's program, if
 * there is one), what happens over time recorded, and a fresh reading of everything for whoever's drawing it.
 */
import { Circuit, DEFAULTS, type Esp32Model, type Part } from '@bench/engine';
import type { Board } from '../builder/board';
import { flowSpeed } from '../flow';
import { PLAIN, type ReadContext } from '../kinds/kind';
import { LiveBoard, type CodeFor, type LivePart, type LiveWire } from './live';
import { Programs, type ProgramFor, type ProgramHost } from './programs';
import type { BoardSnapshot, MeterReadout, PartReading, Trace, WireReading } from './readings';
import { meterReadout, READOUT_SECONDS } from './readout';

const EMPTY: BoardSnapshot = {
  time: 0,
  parts: {},
  wires: {},
  pins: {},
  grounded: false,
  converged: true,
  unsettled: [],
  notWritten: [],
  error: undefined,
  unpowered: 0,
  programs: {},
  program: undefined,
  readout: undefined,
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The most circuit time a slow program can leave owing: past this, the board just runs behind real time. */
const MAX_BACKLOG = 0.25;

export class BoardSim {
  readonly circuit = new Circuit();
  private readonly live: LiveBoard;
  private readonly programs: Programs;
  private backlog = 0;
  private draining: Promise<void> | undefined;
  /** How far each wire's flow dots have travelled, by wire id. */
  private readonly flows = new Map<string, number>();
  /** Each part's average current over the last frame's ticks: what the flow dots show. */
  private averages = new Map<Part, number>();
  /** When the last readout was taken, circuit time (see readout.ts). */
  private readoutAt = 0;
  /** The last readout's averages, while a program was switching pins in its time. */
  private readout: MeterReadout | undefined;
  /** When the batteries last stopped supplying current, circuit time; undefined while one is. */
  private quietSince: number | undefined = 0;
  private readonly listeners = new Set<() => void>();
  private snapshot: BoardSnapshot = EMPTY;
  private stepError: string | undefined;

  /**
   * `programs` runs the ESP32's program; without it, an ESP32 sits on the board doing nothing. `code` says which code
   * each part is built from: Bench's defaults, unless told otherwise.
   */
  constructor(programs?: ProgramHost, code: CodeFor = () => DEFAULTS, programFor?: ProgramFor) {
    this.live = new LiveBoard(this.circuit, code);
    this.programs = new Programs(this.circuit, programs, programFor);
  }

  /** Each chip's program from now on: a chip whose program has changed starts it again, from the top. */
  setPrograms(programFor: ProgramFor): void {
    this.programs.setPrograms(programFor);
    this.programs.sync(this.chips());
    this.step(0);
  }

  /** Brings the circuit in line with `board`, keeping every part that's still there. */
  sync(board: Board): void {
    const { goneWires } = this.live.sync(board);
    for (const id of goneWires) this.flows.delete(id);
    this.programs.sync(this.chips());
    this.step(0);
  }

  /** The board's ESP32s, by part id: each runs its own program. */
  private chips(): Map<string, Esp32Model> {
    const chips = new Map<string, Esp32Model>();
    for (const [id, live] of this.live.parts) if (live.doc.kind === 'esp32') chips.set(id, live.part as Esp32Model);
    return chips;
  }

  /**
   * Builds parts from different code from now on: each part whose code changed is rebuilt, fresh, and any ESP32
   * rebuilt starts its program again.
   */
  setCode(code: CodeFor): void {
    this.live.recode(code);
    this.programs.sync(this.chips());
    this.step(0);
  }

  /** Starts chip `id`'s program again from the top: after its program has changed, say. */
  restartProgram(id: string): void {
    this.programs.restart(id);
    this.programs.sync(this.chips());
    this.step(0);
  }

  /**
   * Advances `dt` seconds, program and all, resolving once it's caught up. With no program on the board this is
   * step(); with one, time moves a tick at a time, waiting for the program wherever it's due.
   */
  advance(dt: number): Promise<void> {
    if (!this.programs.active || dt <= 0) {
      this.step(dt);
      return Promise.resolve();
    }
    this.backlog = Math.min(this.backlog + dt, MAX_BACKLOG);
    this.draining ??= this.drain().finally(() => {
      this.draining = undefined;
    });
    return this.draining;
  }

  private async drain(): Promise<void> {
    while (this.backlog > 0 && this.programs.active) {
      const dt = this.backlog;
      this.backlog = 0;
      try {
        await this.programs.step(dt);
        this.stepError = undefined;
      } catch (error) {
        this.stepError = message(error);
      }
      this.afterStep(dt);
    }
  }

  /**
   * Holds a push button down, or lets it go. Not an edit to the board: a
   * button springs back up, so it isn't saved or undone.
   */
  press(id: string, down: boolean): void {
    const live = this.live.parts.get(id);
    if (!live?.kind.press?.(live.part, down)) return;
    this.circuit.changed(); // sudden: a coil on the board is followed through it in small steps
    this.step(0);
  }

  /** Swaps a burnt part for a fresh one of the same kind and value. */
  replace(id: string): void {
    this.live.rebuild(id);
    this.programs.sync(this.chips());
    this.step(0);
  }

  /**
   * Advances the circuit by `dt` seconds and tells every listener. With a program on the board, time that moves goes
   * through advance(), so the program keeps up; a step that doesn't move time (an edit, a button pressed) re-solves
   * right away, without running it.
   */
  step(dt: number): void {
    if (this.programs.active && dt > 0) {
      void this.advance(dt);
      return;
    }
    try {
      this.circuit.step(dt);
      this.stepError = undefined;
    } catch (error) {
      this.stepError = message(error);
    }
    this.afterStep(dt);
  }

  /** After the circuit's moved on: the flow dots, the records over time, and a fresh snapshot for every listener. */
  private afterStep(dt: number): void {
    this.averages = this.circuit.averageCurrents();
    for (const [id, live] of this.live.wires) {
      const amps = this.stepError ? 0 : (this.averages.get(live.wire) ?? this.wireAmps(live));
      this.flows.set(id, (this.flows.get(id) ?? 0) + flowSpeed(amps) * dt);
    }
    this.track();
    this.takeReadout();
    this.snapshot = this.read();
    for (const listener of this.listeners) listener();
  }

  /**
   * Every READOUT_SECONDS of circuit time, everything's averages since the last: the chips' pins always, and the
   * parts', wires' and pins' too while a program is switching, as a multimeter would show them.
   */
  private takeReadout(): void {
    const c = this.circuit;
    if (c.time - this.readoutAt < READOUT_SECONDS - 1e-9) return;
    this.readoutAt = c.time;
    const switching = this.programs.takeReadout();
    const taken = c.takeReadout();
    this.readout = switching && this.stepError === undefined ? meterReadout(taken, this.live.parts, this.live.wires) : undefined;
  }

  /** For React's useSyncExternalStore. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): BoardSnapshot => this.snapshot;

  /** A capacitor's voltage over the last TRACE_SECONDS of circuit time, or undefined for anything else. */
  trace(id: string): Trace | undefined {
    const live = this.live.parts.get(id);
    return live?.kind.trace?.(live.memo, undefined);
  }

  /** An ESP32 pin's voltage over the last PIN_TRACE_SECONDS of circuit time, by part id and pin id. */
  pinTrace(id: string, pinId: string): Trace | undefined {
    const live = this.live.parts.get(id);
    return live?.kind.trace?.(live.memo, pinId);
  }

  /** Keeps every part's record of what happens over time, in circuit time. */
  private track(): void {
    const failed = this.stepError !== undefined;
    const written = this.writtenParts();
    for (const live of this.live.parts.values()) {
      live.kind.track?.({ ...this.context(live, written, failed), memo: live.memo });
    }
  }

  /** The labels of parts whose code's stamp() is written, so they're in the circuit. */
  private writtenParts(): (label: string) => boolean {
    const unwritten = new Set(this.circuit.notWritten.filter((m) => m.method === 'stamp').map((m) => m.part));
    return (label) => !unwritten.has(label);
  }

  private context(live: LivePart, written: (label: string) => boolean, failed: boolean) {
    return { c: this.circuit, part: live.part, doc: live.doc, nodes: live.nodes, memo: live.memo, written: written(live.doc.label), failed };
  }

  private wireAmps(live: LiveWire): number {
    return this.stepError ? 0 : (this.circuit.currentThrough(live.wire) ?? 0);
  }

  private read(): BoardSnapshot {
    const c = this.circuit;
    const failed = this.stepError !== undefined;
    const programUnwritten = this.programs.unwritten();
    // The circuit lists your pin's stamp(); the program adds its read() and current(), which the circuit never calls
    // (the chip's own current is its supply's) but the program waits for.
    const listed = new Set(c.notWritten.map((m) => `${m.part}.${m.method}`));
    const notWritten = [...c.notWritten, ...programUnwritten.filter((m) => !listed.has(`${m.part}.${m.method}`))];
    const written = this.writtenParts();

    const pins: Record<string, number> = {};
    const parts: Record<string, PartReading> = {};
    let grounded = false;
    let supplying = false;
    for (const [id, live] of this.live.parts) {
      for (const [pin, node] of Object.entries(live.nodes)) pins[`${id}.${pin}`] = failed ? 0 : c.voltage(node);
      const ctx = this.readContext(live, written, failed);
      parts[id] = { ...PLAIN, amps: ctx.amps, volts: ctx.volts, watts: ctx.watts, written: ctx.written, ...live.kind.read?.(ctx) };
      if (live.kind.grounds && this.live.isWired(id)) grounded = true;
      if (live.kind.supplies?.(ctx)) supplying = true;
    }
    if (supplying) this.quietSince = undefined;
    else this.quietSince ??= c.time;

    const programs = this.programs.readings();
    const wires: Record<string, WireReading> = {};
    for (const [id, live] of this.live.wires) wires[id] = { amps: this.wireAmps(live), flow: this.flows.get(id) ?? 0 };

    return {
      time: c.time,
      parts,
      wires,
      pins,
      grounded,
      converged: c.lastStep.converged,
      unsettled: c.lastStep.unsettled,
      notWritten,
      error: this.stepError ?? this.live.buildError,
      unpowered: this.quietSince === undefined ? 0 : c.time - this.quietSince,
      programs,
      // The first chip's, for anything that only needs one.
      program: Object.values(programs).at(0),
      readout: this.readout,
    };
  }

  private readContext(live: LivePart, written: (label: string) => boolean, failed: boolean): ReadContext<Part, unknown> {
    const c = this.circuit;
    const nodes = Object.values(live.nodes);
    const first = nodes.at(0);
    const second = nodes.at(1);
    return {
      ...this.context(live, written, failed),
      amps: failed ? 0 : c.currentThrough(live.part),
      watts: failed ? 0 : c.powerOf(live.part),
      volts: failed || first === undefined || second === undefined ? 0 : c.across(first, second),
      seen: this.circuit.seenCurrent(live.part),
      program: live.doc.kind === 'esp32' ? this.programs.on(live.doc.id) : undefined,
    };
  }
}

// When a part model or the engine changes, start the page fresh: the live circuit holds parts built from the old code.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}
