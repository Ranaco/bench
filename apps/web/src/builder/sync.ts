import {
  adcReading,
  Battery,
  Circuit,
  Electrolytic,
  Esp32,
  Machine,
  NotWrittenYet,
  TICK,
  Ground,
  JUMPER,
  Led,
  Potentiometer,
  Resistor,
  SlideSwitch,
  Switch,
  Transistor,
  Wire,
  type FloatingRead,
  type GpioMode,
  type Level,
  type Node,
  type Part,
  type ProgramTransport,
  type Readings,
  type Unwritten,
} from '@bench/engine';
import type { Board, PinRef, PlacedPart, WireDoc } from './board';
import { flowSpeed } from '../flow';
import { GLOW_AMPS } from '../kit';
import { CATALOG } from './catalog';
import { ESP32_ADC, ESP32_GPIOS } from './esp32Board';

/**
 * Keeps a live circuit in step with the board. Every pin has its own node for
 * as long as its part is on the board, and every drawn wire is a real jumper
 * wire between two pins, so each wire carries its own current.
 *
 * Edits are applied as differences: parts that stay keep their state, so a
 * burnt LED stays burnt when you add an unrelated wire, and a hot resistor
 * stays hot while you move things around.
 */

interface LivePart {
  readonly doc: PlacedPart;
  readonly nodes: Readonly<Record<string, Node>>;
  part: Part;
}

interface LiveWire {
  readonly doc: WireDoc;
  readonly wire: Wire;
}

export interface PartReading {
  /**
   * Amps through it, in its own direction: out of a battery's plus, into a
   * resistor's left pin, anode to cathode in an LED, into ground. Undefined
   * while its model isn't written.
   */
  readonly amps: number | undefined;
  /** Volts across it, first pin minus second (0 for ground). */
  readonly volts: number;
  /** Watts it turns into heat or light; negative when it supplies power. */
  readonly watts: number;
  /** Its temperature, °C, for parts that heat up. */
  readonly celsius: number | undefined;
  readonly burnt: boolean;
  /**
   * Past what its datasheet allows: an LED over its rated current, a resistor
   * over its rated temperature, a switch carrying more than its contacts are rated for.
   */
  readonly over: boolean;
  /** For a push button: whether it's held down right now. */
  readonly closed: boolean | undefined;
  /** For a knob: its two legs and the current along each. */
  readonly knob: KnobReading | undefined;
  /** For a capacitor: the charge it's holding. */
  readonly capacitor: CapacitorReading | undefined;
  /** For a transistor: the current into its base, and what that lets through. */
  readonly transistor: TransistorReading | undefined;
  /** For an ESP32 board: each GPIO pin. */
  readonly chip: ChipReading | undefined;
  /** For an LED: how many times it's come on since it was placed (or the board was loaded). */
  readonly flips: number | undefined;
  /** For an LED: seconds it's been glowing without a break (at least the faintest current its datasheet plots). */
  readonly glowing: number | undefined;
  /** For a glowing LED: the most current it's carried since it started glowing, A. */
  readonly peakAmps: number | undefined;
  /** False while its stamp() isn't written, so it isn't in the circuit. */
  readonly written: boolean;
}

export interface KnobReading {
  /** Ohms from pin 1 to the wiper, and from the wiper to pin 3. */
  readonly legs: readonly [number, number];
  /** Volts from pin 1 to the wiper, and from the wiper to pin 3. */
  readonly volts: readonly [number, number];
  /** Amps out of the wiper: what's come in along both legs together. */
  readonly wiperAmps: number;
}

export interface CapacitorReading {
  /** Volts it's holding, plus to minus: what its plates were charged to at the end of the last tick. */
  readonly held: number;
  readonly farads: number;
  readonly ratedVolts: number;
  /** Charged the wrong way round: minus above plus. */
  readonly reversed: boolean;
  /** How fast its voltage is changing, V/s, over the last half second: undefined until it has that much history. */
  readonly rising: number | undefined;
}

/** One GPIO pin of an ESP32, as it is right now. */
export interface ChipPin {
  readonly gpio: number;
  readonly mode: GpioMode;
  /** While it's an output: driving HIGH. */
  readonly high: boolean;
  /** What it reads, by your pin's read(); undefined while that isn't written. */
  readonly level: Level | undefined;
  /** Volts against the board's GND. */
  readonly volts: number;
  /** Amps out of the pin, by your pin's current(); undefined while that isn't written. */
  readonly amps: number | undefined;
  /** How many times it's gone between HIGH and LOW while reading (an input, with or without a pull). */
  readonly changes: number;
  /** For a pin analogRead() can read: the lowest and highest it's read since the board was loaded. */
  readonly analogRange: readonly [number, number] | undefined;
  /** For a pin analogRead() can read: what it would give right now. */
  readonly analog: number | undefined;
  /**
   * Nothing holds it: its leak (up to 50 nA, either way) through the resistance it sees could move it further than the
   * whole supply. Its voltage then means nothing, so it isn't shown.
   */
  readonly floating: boolean;
}

export interface ChipReading {
  /** By pin id ("gpio4"). */
  readonly pins: Readonly<Record<string, ChipPin>>;
  /** Amps out of the 3V3 supply into everything the chip powers. */
  readonly supplyAmps: number;
}

/** The program on the board's ESP32: what it's printed, and whether it's running. */
export interface ProgramReading {
  /** The ESP32's part id. */
  readonly chip: string;
  readonly serial: string;
  /** Why it stopped, once it has: a mistake in it, or it got stuck. */
  readonly failure: string | undefined;
  /** Each time it read a pin that could have gone either way. */
  readonly floating: readonly FloatingRead[];
  /** False while your pin model isn't written, so the program can't run yet. */
  readonly runs: boolean;
  /** The pins it has read with analogRead(). */
  readonly analogPins: ReadonlySet<number>;
}

/** A pin's voltage over the last little while: what the Graph draws for an ESP32. */
export const PIN_TRACE_SECONDS = 5;

/** What a transistor is doing: nothing, amplifying, or switched fully on. */
export type TransistorState = 'off' | 'amplifying' | 'on';

export interface TransistorReading {
  /** Amps into the base. */
  readonly baseAmps: number;
  /** Amps in at the collector: the part's own current, so undefined while its current() isn't written. */
  readonly collectorAmps: number | undefined;
  /** Volts collector to emitter, and base to emitter. */
  readonly collectorVolts: number;
  readonly baseVolts: number;
  /** Undefined while there's no collector current to judge it by. */
  readonly state: TransistorState | undefined;
}

/**
 * Below this into the base, a transistor counts as off. Ours, not the datasheet's: a microamp into a PN2222A lets
 * through a quarter of a milliamp, under the faintest glow on the LED's datasheet.
 */
const OFF_BASE_AMPS = 1e-6;

/**
 * Once the collector carries less than this share of what the base current could let through, something else in
 * the circuit is setting the current, not the transistor: it's switched fully on (saturated). Ours: a line drawn
 * clear of the noise either side.
 */
const ON_SHARE = 0.9;

/** A capacitor's voltage over the last little while: what the Graph draws. */
export interface Trace {
  /** Circuit time of each sample, s. */
  readonly times: readonly number[];
  readonly volts: readonly number[];
}

/** How far back a capacitor's trace goes, s. */
export const TRACE_SECONDS = 30;

/**
 * Below this, a battery counts as unplugged. Far less than anything connected to one draws here: the smallest
 * leak in the kit, the 220 µF capacitor's, takes 20 µA from a 9 V battery.
 */
const IDLE_AMPS = 1e-6;

/** Reverse voltage a capacitor is allowed before it counts as charged the wrong way: well clear of the solver's noise. */
const REVERSE_VOLTS = 1e-3;

/** How far back a capacitor's rate of climb is measured, s: long enough to smooth over frame-to-frame jitter. */
const RATE_SECONDS = 0.5;

export interface WireReading {
  /** Amps from its first end to its second. */
  readonly amps: number;
  /** How far the flow dots have travelled along it, in drawing units. */
  readonly flow: number;
}

export interface BoardSnapshot {
  readonly time: number;
  /** By part id. A part added this frame has no reading until the next step. */
  readonly parts: Readonly<Partial<Record<string, PartReading>>>;
  readonly wires: Readonly<Partial<Record<string, WireReading>>>;
  /** Volts at each pin ("p3.anode"), measured from ground. */
  readonly pins: Readonly<Partial<Record<string, number>>>;
  /** True when a ground symbol is wired in, so pin voltages mean something on their own. */
  readonly grounded: boolean;
  readonly converged: boolean;
  readonly unsettled: readonly string[];
  readonly notWritten: readonly Unwritten[];
  /** Set when a part threw something other than "not written yet". */
  readonly error: string | undefined;
  /** Seconds since every battery on the board stopped supplying current (unplugged, or switched off). */
  readonly unpowered: number;
  /** The program on the board's ESP32, if there is one. */
  readonly program: ProgramReading | undefined;
}

export const pinKey = (ref: PinRef) => `${ref.part}.${ref.pin}`;

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
  program: undefined,
};

function sameProps(a: PlacedPart['props'], b: PlacedPart['props']): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** How Bench runs a program: given the board's chip, where its program runs (a worker, or for tests, right here). */
export type ProgramHost = (chip: Esp32) => ProgramTransport & { stop?(): void };

/** The most circuit time a slow program can leave owing: past this, the board just runs behind real time. */
const MAX_BACKLOG = 0.25;

export class BoardSim {
  readonly circuit = new Circuit();
  /** The ESP32 running a program, when there's one on the board and a host to run it. */
  private machine: { readonly chip: Esp32; readonly machine: Machine; readonly transport: ReturnType<ProgramHost> } | undefined;
  private backlog = 0;
  private draining: Promise<void> | undefined;
  /** Each ESP32 pin's recent voltage, by "partId.pinId". */
  private readonly pinTraces = new Map<string, { times: number[]; volts: number[] }>();
  /** Each ESP32 pin's last level while reading, and how many times it's changed, by "partId.pinId". */
  private readonly pinChanges = new Map<string, { level: Level | undefined; changes: number }>();
  /** Each analog pin's lowest and highest analogRead() value seen, by "partId.pinId". */
  private readonly analogSeen = new Map<string, [number, number]>();
  /** How many times each LED has come on, and whether it's on now, by part id. */
  private readonly ledFlips = new Map<string, { on: boolean; flips: number }>();

  /** `programs` runs the ESP32's program; without it, an ESP32 sits on the board doing nothing. */
  constructor(private readonly programs?: ProgramHost) {}
  private readonly parts = new Map<string, LivePart>();
  private readonly wires = new Map<string, LiveWire>();
  private readonly flows = new Map<string, number>();
  /** Each capacitor's recent voltage, by part id. */
  private readonly traces = new Map<string, { times: number[]; volts: number[] }>();
  /** When each glowing LED started glowing, circuit time, and the most current it's carried since, by part id. */
  private readonly litSince = new Map<string, { since: number; peak: number }>();
  /** When the batteries last stopped supplying current, circuit time; undefined while one is. */
  private quietSince: number | undefined = 0;
  private readonly listeners = new Set<() => void>();
  private snapshot: BoardSnapshot = EMPTY;
  private buildError: string | undefined;
  private stepError: string | undefined;

  /** Brings the circuit in line with `board`, keeping every part that's still there. */
  sync(board: Board): void {
    const keepParts = new Map(board.parts.map((p) => [p.id, p]));
    const keepWires = new Set(board.wires.map((w) => w.id));

    // Out first, so freed nodes can be reused by whatever comes in.
    for (const [id, live] of this.wires) {
      if (keepWires.has(id)) continue;
      this.circuit.remove(live.wire);
      this.wires.delete(id);
      this.flows.delete(id);
    }
    for (const [id, live] of this.parts) {
      if (keepParts.has(id)) continue;
      this.circuit.remove(live.part);
      for (const node of Object.values(live.nodes)) this.circuit.release(node);
      this.parts.delete(id);
      this.traces.delete(id);
      this.litSince.delete(id);
      this.ledFlips.delete(id);
      for (const map of [this.pinTraces, this.pinChanges, this.analogSeen]) {
        for (const key of map.keys()) if (key.startsWith(`${id}.`)) map.delete(key);
      }
    }

    this.buildError = undefined;
    for (const doc of board.parts) {
      const live = this.parts.get(doc.id);
      if (!live) {
        this.addPart(doc);
      } else if (!sameProps(live.doc.props, doc.props)) {
        // A different value is a different part from the kit: fresh and cool.
        this.swap(live, doc);
      } else if (live.doc !== doc) {
        this.parts.set(doc.id, { ...live, doc }); // moved or turned: nothing electrical changed
      }
    }

    for (const doc of board.wires) {
      if (this.wires.has(doc.id)) continue;
      const a = this.parts.get(doc.a.part)?.nodes[doc.a.pin];
      const b = this.parts.get(doc.b.part)?.nodes[doc.b.pin];
      if (a === undefined || b === undefined) continue;
      const wire = new Wire(doc.label, a, b, { ...JUMPER, lengthMetres: doc.metres });
      this.wires.set(doc.id, { doc, wire: this.circuit.add(wire) });
    }

    this.syncMachine();
    this.step(0);
  }

  /** Starts the program on the board's first ESP32, or stops it when that board's gone (or replaced). */
  private syncMachine(): void {
    const chip = [...this.parts.values()].map((live) => live.part).find((part): part is Esp32 => part instanceof Esp32);
    if (this.machine?.chip === chip) return;
    this.machine?.transport.stop?.();
    this.machine = undefined;
    if (!chip || !this.programs) return;
    const transport = this.programs(chip);
    this.machine = { chip, transport, machine: new Machine(this.circuit, chip, transport, ESP32_ADC) };
  }

  /**
   * Advances `dt` seconds, program and all, resolving once it's caught up. With no program on the board this is
   * step(); with one, time moves a tick at a time, waiting for the program wherever it's due.
   */
  advance(dt: number): Promise<void> {
    if (!this.machine || dt <= 0) {
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
    while (this.backlog > 0 && this.machine) {
      const { machine } = this.machine;
      const dt = this.backlog;
      this.backlog = 0;
      try {
        await machine.step(dt);
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
    const part = this.parts.get(id)?.part;
    if (!(part instanceof Switch) || part.closed === down) return;
    part.closed = down;
    this.step(0);
  }

  /** Swaps a burnt part for a fresh one of the same kind and value. */
  replace(id: string): void {
    const live = this.parts.get(id);
    if (live) this.swap(live, live.doc);
    this.step(0);
  }

  /**
   * Advances the circuit by `dt` seconds and tells every listener. With a program on the board, time that moves goes
   * through advance(), so the program keeps up; a step that doesn't move time (an edit, a button pressed) re-solves
   * right away, without running it.
   */
  step(dt: number): void {
    if (this.machine && dt > 0) {
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
    for (const [id, live] of this.wires) {
      const amps = this.wireAmps(live);
      this.flows.set(id, (this.flows.get(id) ?? 0) + flowSpeed(amps) * dt);
    }
    this.track();
    this.snapshot = this.read();
    for (const listener of this.listeners) listener();
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
    return this.traces.get(id);
  }

  /**
   * Keeps the record of things that happen over time, in circuit time: each capacitor's voltage, how long each LED
   * has been glowing, and how long the batteries have been quiet.
   */
  private track(): void {
    const c = this.circuit;
    const now = c.time;
    const failed = this.stepError !== undefined;
    let supplying = false;
    for (const [id, live] of this.parts) {
      const part = live.part;
      if (part instanceof Electrolytic) {
        let trace = this.traces.get(id);
        if (!trace) {
          trace = { times: [], volts: [] };
          this.traces.set(id, trace);
        }
        if (trace.times.at(-1) === now) {
          trace.volts[trace.volts.length - 1] = part.held; // a re-solve with no time passed: the same moment
        } else {
          trace.times.push(now);
          trace.volts.push(part.held);
        }
        const oldest = trace.times.findIndex((t) => t >= now - TRACE_SECONDS);
        if (oldest > 0) {
          trace.times.splice(0, oldest);
          trace.volts.splice(0, oldest);
        }
      }
      if (part instanceof Led) {
        const amps = failed || part.burnt ? 0 : (c.currentThrough(part) ?? 0);
        const lit = this.litSince.get(id);
        if (amps < GLOW_AMPS) this.litSince.delete(id);
        else if (!lit) this.litSince.set(id, { since: now, peak: amps });
        else if (amps > lit.peak) this.litSince.set(id, { since: lit.since, peak: amps });
        const flips = this.ledFlips.get(id) ?? { on: false, flips: 0 };
        const on = amps >= GLOW_AMPS;
        this.ledFlips.set(id, { on, flips: flips.flips + (on && !flips.on ? 1 : 0) });
      }
      if (part instanceof Esp32 && !failed) this.trackChip(id, part, now);
      if (part instanceof Battery && !failed && Math.abs(c.currentThrough(part) ?? 0) >= IDLE_AMPS) supplying = true;
    }
    if (supplying) this.quietSince = undefined;
    else this.quietSince ??= now;
  }

  /**
   * An ESP32's pins over time: each one's voltage, its level changes while reading, and its analog range. A floating
   * pin's voltage means nothing, so it leaves a gap in the trace and counts towards nothing.
   */
  private trackChip(id: string, chip: Esp32, now: number): void {
    const c = this.circuit;
    for (const { id: pinId, gpio: number, gpioPart: gpio, volts, ohms, floating } of chipPins(chip, c)) {
      const key = `${id}.${pinId}`;
      let trace = this.pinTraces.get(key);
      if (!trace) {
        trace = { times: [], volts: [] };
        this.pinTraces.set(key, trace);
      }
      const shown = floating ? Number.NaN : volts;
      if (trace.times.at(-1) === now) trace.volts[trace.volts.length - 1] = shown;
      else {
        trace.times.push(now);
        trace.volts.push(shown);
      }
      const oldest = trace.times.findIndex((t) => t >= now - PIN_TRACE_SECONDS);
      if (oldest > 0) {
        trace.times.splice(0, oldest);
        trace.volts.splice(0, oldest);
      }
      if (gpio.mode !== 'output') {
        const level = attempt(() => gpio.read(volts, ohms));
        const seen = this.pinChanges.get(key) ?? { level: undefined, changes: 0 };
        const changed = level !== undefined && level !== 'unknown' && seen.level !== undefined && seen.level !== 'unknown' && level !== seen.level;
        this.pinChanges.set(key, { level, changes: seen.changes + (changed ? 1 : 0) });
      }
      const unit = ESP32_ADC[number];
      if (unit !== undefined && !floating) {
        const value = adcReading(volts, unit);
        const range = this.analogSeen.get(key);
        this.analogSeen.set(key, range ? [Math.min(range[0], value), Math.max(range[1], value)] : [value, value]);
      }
    }
  }

  /** An ESP32 pin's voltage over the last PIN_TRACE_SECONDS of circuit time, by part id and pin id. */
  pinTrace(id: string, pinId: string): Trace | undefined {
    return this.pinTraces.get(`${id}.${pinId}`);
  }

  private create(doc: PlacedPart, nodes: Readonly<Record<string, Node>>): Part | undefined {
    try {
      return CATALOG[doc.kind].create(doc.label, nodes, doc.props);
    } catch (error) {
      this.buildError = `${doc.label}: building it failed: ${message(error)}`;
      return undefined;
    }
  }

  private addPart(doc: PlacedPart): void {
    const nodes = Object.fromEntries(CATALOG[doc.kind].pins.map((pin) => [pin.id, this.circuit.node(`${doc.label}.${pin.id}`)]));
    const part = this.create(doc, nodes);
    if (!part) {
      for (const node of Object.values(nodes)) this.circuit.release(node);
      return;
    }
    this.parts.set(doc.id, { doc, nodes, part: this.circuit.add(part) });
  }

  private swap(live: LivePart, doc: PlacedPart): void {
    const fresh = this.create(doc, live.nodes);
    if (!fresh) return;
    this.circuit.replace(live.part, fresh);
    this.parts.set(doc.id, { doc, nodes: live.nodes, part: fresh });
    this.traces.delete(doc.id); // a fresh one from the kit: a new trace, starting empty
  }

  private wireAmps(live: LiveWire): number {
    return this.stepError ? 0 : (this.circuit.currentThrough(live.wire) ?? 0);
  }

  private read(): BoardSnapshot {
    const c = this.circuit;
    const failed = this.stepError !== undefined;
    const machine = this.machine?.machine;
    const programUnwritten = machine?.unwritten() ?? [];
    // The circuit lists your pin's stamp(); the machine adds its read(), which only a program calls.
    const notWritten = [...c.notWritten, ...programUnwritten.filter((m) => m.method === 'read')];
    const unwritten = new Set(c.notWritten.filter((m) => m.method === 'stamp').map((m) => m.part));

    const pins: Record<string, number> = {};
    const parts: Record<string, PartReading> = {};
    let grounded = false;
    for (const [id, live] of this.parts) {
      for (const [pin, node] of Object.entries(live.nodes)) pins[`${id}.${pin}`] = failed ? 0 : c.voltage(node);
      const written = !unwritten.has(live.doc.label);
      parts[id] = this.readPart(live, written, failed);
      if (live.part instanceof Ground && this.isWired(id)) grounded = true;
    }

    const wires: Record<string, WireReading> = {};
    for (const [id, live] of this.wires) wires[id] = { amps: this.wireAmps(live), flow: this.flows.get(id) ?? 0 };

    return {
      time: c.time,
      parts,
      wires,
      pins,
      grounded,
      converged: c.lastStep.converged,
      unsettled: c.lastStep.unsettled,
      notWritten,
      error: this.stepError ?? this.buildError,
      unpowered: this.quietSince === undefined ? 0 : c.time - this.quietSince,
      program:
        this.machine && machine
          ? {
              chip: [...this.parts].find(([, live]) => live.part === this.machine?.chip)?.[0] ?? '',
              serial: machine.serial,
              failure: machine.failure === undefined ? undefined : message(machine.failure),
              floating: machine.floating,
              runs: programUnwritten.length === 0,
              analogPins: machine.analogPins,
            }
          : undefined,
    };
  }

  private readPart(live: LivePart, written: boolean, failed: boolean): PartReading {
    const c = this.circuit;
    const part = live.part;
    const amps = failed ? 0 : c.currentThrough(part);
    const watts = failed ? 0 : c.powerOf(part);
    const nodes = Object.values(live.nodes);
    const first = nodes.at(0);
    const second = nodes.at(1);
    const volts = failed || first === undefined || second === undefined ? 0 : c.across(first, second);
    const base = {
      amps,
      volts,
      watts,
      written,
      closed: undefined,
      knob: undefined,
      capacitor: undefined,
      transistor: undefined,
      chip: undefined,
      flips: undefined,
      glowing: undefined,
      peakAmps: undefined,
    };
    if (part instanceof Switch || part instanceof SlideSwitch) {
      const over = Math.abs(amps ?? 0) > part.spec.ratedAmps;
      return { ...base, celsius: undefined, burnt: false, over, closed: part instanceof Switch ? part.closed : undefined };
    }
    if (part instanceof Potentiometer) {
      // legs() is given in the stub, so it's safe to call; the circuit only has the knob in it once stamp() is written.
      const legs = part.legs();
      const toWiper: readonly [number, number] = failed || !written ? [0, 0] : [c.across(part.a, part.wiper), c.across(part.wiper, part.b)];
      const knob = { legs, volts: toWiper, wiperAmps: toWiper[0] / legs[0] - toWiper[1] / legs[1] };
      const ends = failed || !written ? 0 : c.across(part.a, part.b);
      return { ...base, volts: ends, celsius: undefined, burnt: false, over: watts > part.spec.ratedWatts, knob };
    }
    if (part instanceof Led) {
      const over = !part.burnt && (amps ?? 0) > part.spec.maxAmps;
      const lit = this.litSince.get(live.doc.id);
      return {
        ...base,
        celsius: part.temperature,
        burnt: part.burnt,
        over,
        glowing: lit && c.time - lit.since,
        peakAmps: lit?.peak,
        flips: this.ledFlips.get(live.doc.id)?.flips ?? 0,
      };
    }
    if (part instanceof Electrolytic) {
      // Its watts are going into (or coming back out of) its charge, not into heat.
      const { ratedVolts, farads } = part.spec;
      const reversed = written && part.held < -REVERSE_VOLTS;
      const capacitor = { held: written ? part.held : 0, farads, ratedVolts, reversed, rising: written ? this.rateOf(live.doc.id) : undefined };
      return { ...base, celsius: undefined, burnt: false, over: reversed || part.held > ratedVolts, capacitor };
    }
    if (part instanceof Esp32) {
      const pins: Record<string, ChipPin> = {};
      let over = false;
      const readings = readingsOf(c);
      for (const { id: pinId, gpio: number, gpioPart: gpio, volts: measured, ohms, floating: adrift } of chipPins(part, c)) {
        const key = `${live.doc.id}.${pinId}`;
        const volts = failed ? 0 : measured;
        const floating = failed || adrift;
        const amps = written && !failed ? attempt(() => gpio.current(readings)) : undefined;
        const spec = gpio.spec;
        const unit = ESP32_ADC[number];
        // Past the datasheet: more than its typical drive current, or (on a pin something's holding) a voltage outside
        // what a pin may be given. A floating pin's voltage means nothing, so it can't be over.
        const outside = !floating && (volts > spec.maxVolts || volts < -0.3);
        if ((amps ?? 0) > spec.sourceAmps || (amps ?? 0) < -spec.sinkAmps || outside) over = true;
        pins[pinId] = {
          gpio: number,
          mode: gpio.mode,
          high: gpio.high,
          level: written && !failed ? attempt(() => gpio.read(volts, ohms)) : undefined,
          volts,
          amps,
          changes: this.pinChanges.get(key)?.changes ?? 0,
          analogRange: this.analogSeen.get(key),
          // Shown where the program reads it as a number; a pin it reads as HIGH or LOW needn't say.
          analog: unit === undefined || floating || !this.machine?.machine.analogPins.has(number) ? undefined : adcReading(volts, unit),
          floating,
        };
      }
      const chip = { pins, supplyAmps: failed ? 0 : (amps ?? 0) };
      return { ...base, volts: failed ? 0 : c.across(part.vdd, part.gnd), celsius: undefined, burnt: false, over: written && over, chip };
    }
    if (part instanceof Transistor) {
      // Its leads are given in the stub, so the nodes inside them exist once its stamp has run at all.
      const live = written && !failed;
      const collectorAmps = live ? amps : 0;
      const baseAmps = live ? c.across(part.base, part.inside.base) / part.spec.baseOhms : 0;
      const collectorVolts = failed ? 0 : c.across(part.collector, part.emitter);
      const baseVolts = failed ? 0 : c.across(part.base, part.emitter);
      const state: TransistorState | undefined =
        baseAmps < OFF_BASE_AMPS
          ? 'off'
          : collectorAmps === undefined
            ? undefined
            : collectorAmps < ON_SHARE * part.spec.forwardGain * baseAmps
              ? 'on'
              : 'amplifying';
      const { maxCollectorAmps, maxCollectorVolts, maxWatts } = part.spec;
      const over = (collectorAmps ?? 0) > maxCollectorAmps || collectorVolts > maxCollectorVolts || watts > maxWatts;
      // Out of the circuit until its stamp is written: nothing to read.
      const transistor = live ? { baseAmps, collectorAmps, collectorVolts, baseVolts, state } : undefined;
      return { ...base, volts: collectorVolts, celsius: undefined, burnt: false, over: live && over, transistor };
    }
    if (part instanceof Resistor) {
      const over = !part.burnt && part.temperature > part.spec.maxCelsius;
      return { ...base, celsius: part.temperature, burnt: part.burnt, over };
    }
    return { ...base, celsius: undefined, burnt: false, over: false };
  }

  /** A capacitor's voltage change per second over its last RATE_SECONDS of trace. */
  private rateOf(id: string): number | undefined {
    const trace = this.traces.get(id);
    const now = trace?.times.at(-1);
    if (!trace || now === undefined) return undefined;
    const back = trace.times.findLastIndex((t) => t <= now - RATE_SECONDS);
    if (back === -1) return undefined;
    return ((trace.volts.at(-1) ?? 0) - (trace.volts[back] ?? 0)) / (now - (trace.times[back] ?? now));
  }

  private isWired(id: string): boolean {
    for (const live of this.wires.values()) if (live.doc.a.part === id || live.doc.b.part === id) return true;
    return false;
  }
}

/** A circuit's readings as they stand, for a part's own methods to read from. */
function readingsOf(c: Circuit): Readings {
  return {
    time: c.time,
    dt: TICK,
    ambient: c.ambient,
    voltage: (node) => c.voltage(node),
    across: (a, b) => c.across(a, b),
    branchCurrent: () => 0,
  };
}

/** What a part method gives, or undefined while it isn't written. */
function attempt<T>(run: () => T): T | undefined {
  try {
    return run();
  } catch (error) {
    if (error instanceof NotWrittenYet) return undefined;
    throw error;
  }
}

/**
 * Each of the board's GPIO pins as the circuit stands: its voltage against the chip's GND, the resistance holding it
 * there (all from one elimination), and whether nothing is: its 50 nA of leak could move it further than the supply.
 */
function chipPins(chip: Esp32, c: Circuit) {
  const pins = ESP32_GPIOS.flatMap((p) => {
    const gpioPart = chip.pins.get(p.gpio);
    return gpioPart ? [{ ...p, gpioPart }] : [];
  });
  const ohmsOf = c.resistancesBetween(pins.map((p) => [p.gpioPart.pin, chip.gnd] as const));
  return pins.map((p, i) => {
    const ohms = ohmsOf[i] ?? Infinity;
    const { leakAmps, supplyVolts } = p.gpioPart.spec;
    return { ...p, volts: c.across(p.gpioPart.pin, chip.gnd), ohms, floating: leakAmps * ohms > supplyVolts };
  });
}

// When a part model or the engine changes, start the page fresh: the live circuit holds parts built from the old code.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}
