import { Circuit, Ground, JUMPER, Led, Potentiometer, Resistor, SlideSwitch, Switch, Wire, type Node, type Part, type Unwritten } from '@bench/engine';
import type { Board, PinRef, PlacedPart, WireDoc } from './board';
import { flowSpeed } from '../flow';
import { CATALOG } from './catalog';

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
};

function sameProps(a: PlacedPart['props'], b: PlacedPart['props']): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class BoardSim {
  readonly circuit = new Circuit();
  private readonly parts = new Map<string, LivePart>();
  private readonly wires = new Map<string, LiveWire>();
  private readonly flows = new Map<string, number>();
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

    this.step(0);
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

  /** Advances the circuit by `dt` seconds and tells every listener. */
  step(dt: number): void {
    try {
      this.circuit.step(dt);
      this.stepError = undefined;
    } catch (error) {
      this.stepError = message(error);
    }
    for (const [id, live] of this.wires) {
      const amps = this.wireAmps(live);
      this.flows.set(id, (this.flows.get(id) ?? 0) + flowSpeed(amps) * dt);
    }
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
  }

  private wireAmps(live: LiveWire): number {
    return this.stepError ? 0 : (this.circuit.currentThrough(live.wire) ?? 0);
  }

  private read(): BoardSnapshot {
    const c = this.circuit;
    const failed = this.stepError !== undefined;
    const notWritten = c.notWritten;
    const unwritten = new Set(notWritten.filter((m) => m.method === 'stamp').map((m) => m.part));

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
    const base = { amps, volts, watts, written, closed: undefined, knob: undefined };
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
      return { ...base, celsius: part.temperature, burnt: part.burnt, over };
    }
    if (part instanceof Resistor) {
      const over = !part.burnt && part.temperature > part.spec.maxCelsius;
      return { ...base, celsius: part.temperature, burnt: part.burnt, over };
    }
    return { ...base, celsius: undefined, burnt: false, over: false };
  }

  private isWired(id: string): boolean {
    for (const live of this.wires.values()) if (live.doc.a.part === id || live.doc.b.part === id) return true;
    return false;
  }
}

// When a part model or the engine changes, start the page fresh: the live circuit holds parts built from the old code.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}
