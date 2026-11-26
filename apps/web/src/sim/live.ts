/**
 * Keeps a live circuit in step with the board. Every pin has its own node for as long as its part is on the board,
 * and every drawn wire is a real jumper wire between two pins, so each wire carries its own current.
 *
 * Edits are applied as differences: parts that stay keep their state, so a burnt LED stays burnt when you add an
 * unrelated wire, and a hot resistor stays hot while you move things around.
 */
import { JUMPER, Wire, type Circuit, type Code, type Node, type Part } from '@bench/engine';
import type { Board, PlacedPart, WireDoc } from '../builder/board';
import type { KindModel } from '../kinds/kind';
import { KINDS } from '../kinds/models';

/** A part on the board, in the circuit. */
export interface LivePart {
  readonly doc: PlacedPart;
  readonly kind: KindModel;
  readonly nodes: Readonly<Record<string, Node>>;
  part: Part;
  /** The code it was built from. */
  code: Code;
  /** Its kind's record of what's happened to it over time; starts afresh when it's swapped for a new one. */
  memo: unknown;
}

export interface LiveWire {
  readonly doc: WireDoc;
  readonly wire: Wire;
}

/** Which code a part on the board is built from. */
export type CodeFor = (doc: PlacedPart) => Code;

function sameProps(a: PlacedPart['props'], b: PlacedPart['props']): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class LiveBoard {
  readonly parts = new Map<string, LivePart>();
  readonly wires = new Map<string, LiveWire>();
  /** Why a part couldn't be built, at the last sync. */
  buildError: string | undefined;

  constructor(
    private readonly circuit: Circuit,
    private codeFor: CodeFor,
  ) {}

  /**
   * Builds parts from different code from now on. Every part whose code changes is rebuilt from it, fresh (a hot LED
   * starts cool, a charged capacitor empty): the old one's state belonged to the old code. Returns the ids rebuilt.
   */
  recode(codeFor: CodeFor): string[] {
    this.codeFor = codeFor;
    // Whatever went wrong building parts before is judged afresh: fixed code may build now.
    this.buildError = undefined;
    const rebuilt: string[] = [];
    for (const live of this.parts.values()) {
      const code = codeFor(live.doc);
      if (live.kind.modules.every((m) => code[m] === live.code[m])) continue;
      this.swap(live, live.doc);
      rebuilt.push(live.doc.id);
    }
    // A part whose code couldn't build before isn't in the circuit: try it again, and the wires to it.
    if (this.board) this.addMissing(this.board);
    return rebuilt;
  }

  /** The board as last synced: what recode() tries again to build. */
  private board: Board | undefined;

  /** Brings the circuit in line with `board`, keeping every part that's still there. Returns the ids taken out. */
  sync(board: Board): { readonly goneWires: readonly string[] } {
    this.board = board;
    const keepParts = new Map(board.parts.map((p) => [p.id, p]));
    const keepWires = new Set(board.wires.map((w) => w.id));
    const goneWires: string[] = [];

    // Out first, so freed nodes can be reused by whatever comes in.
    for (const [id, live] of this.wires) {
      if (keepWires.has(id)) continue;
      this.circuit.remove(live.wire);
      this.wires.delete(id);
      goneWires.push(id);
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
      if (!live) continue;
      if (!sameProps(live.doc.props, doc.props)) {
        // A different value is a different part from the kit: fresh and cool.
        this.swap(live, doc);
      } else if (live.doc !== doc) {
        this.parts.set(doc.id, { ...live, doc }); // moved or turned: nothing electrical changed
      }
    }
    this.addMissing(board);
    return { goneWires };
  }

  /** Builds every part and wire on `board` that isn't in the circuit yet. */
  private addMissing(board: Board): void {
    for (const doc of board.parts) if (!this.parts.has(doc.id)) this.add(doc);
    for (const doc of board.wires) {
      if (this.wires.has(doc.id)) continue;
      const a = this.parts.get(doc.a.part)?.nodes[doc.a.pin];
      const b = this.parts.get(doc.b.part)?.nodes[doc.b.pin];
      if (a === undefined || b === undefined) continue;
      const wire = new Wire(doc.label, a, b, { ...JUMPER, lengthMetres: doc.metres });
      this.wires.set(doc.id, { doc, wire: this.circuit.add(wire) });
    }
  }

  /** Swaps a part for a fresh one of the same kind and value, built from the code it runs now. */
  rebuild(id: string): void {
    const live = this.parts.get(id);
    if (live) this.swap(live, live.doc);
  }

  /** Whether any wire reaches the part. */
  isWired(id: string): boolean {
    for (const live of this.wires.values()) if (live.doc.a.part === id || live.doc.b.part === id) return true;
    return false;
  }

  private create(doc: PlacedPart, nodes: Readonly<Record<string, Node>>): { part: Part; code: Code } | undefined {
    const code = this.codeFor(doc);
    try {
      return { part: KINDS[doc.kind].create(doc.label, nodes, doc.props, code), code };
    } catch (error) {
      this.buildError = `${doc.label}: building it failed: ${message(error)}`;
      return undefined;
    }
  }

  private add(doc: PlacedPart): void {
    const kind = KINDS[doc.kind];
    const nodes = Object.fromEntries(kind.pins.map((pin) => [pin.id, this.circuit.node(`${doc.label}.${pin.id}`)]));
    const made = this.create(doc, nodes);
    if (!made) {
      for (const node of Object.values(nodes)) this.circuit.release(node);
      return;
    }
    this.parts.set(doc.id, { doc, kind, nodes, part: this.circuit.add(made.part), code: made.code, memo: kind.memo?.() });
  }

  private swap(live: LivePart, doc: PlacedPart): void {
    const fresh = this.create(doc, live.nodes);
    if (!fresh) return;
    this.circuit.replace(live.part, fresh.part);
    // A fresh one from the kit: its record starts again too.
    this.parts.set(doc.id, { doc, kind: live.kind, nodes: live.nodes, part: fresh.part, code: fresh.code, memo: live.kind.memo?.() });
  }
}
