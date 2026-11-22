/**
 * The board: what's placed where and what's wired to what. A plain value that
 * never changes in place, so undo is just a list of boards, and saving is JSON.
 * Nothing about the simulation (heat, current) lives here.
 */

import { JUMPER } from '@bench/engine';
import type { Point } from '../geometry';

export type Rotation = 0 | 90 | 180 | 270;

/** A junction is where a wire was tapped: a dot that wires share. It never comes from the parts box. */
export type PartKind = 'battery' | 'resistor' | 'led' | 'ground' | 'switch' | 'button' | 'knob' | 'capacitor' | 'junction';

export interface PlacedPart {
  readonly id: string;
  readonly kind: PartKind;
  /** What it's called on the board: B1, R2, D1… */
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: Rotation;
  readonly props: Readonly<Record<string, string | number>>;
}

export interface PinRef {
  readonly part: string;
  readonly pin: string;
}

/** A way along the grid. */
export type Heading = 'up' | 'down' | 'left' | 'right';

export const HEADINGS: Readonly<Record<Heading, Point>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Readonly<Record<Heading, Heading>> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/**
 * One end of a wire. `through` marks an end that runs straight on through a
 * junction (half of a tapped wire), and which way it leaves the junction, so
 * the two halves always redraw exactly the path the wire took.
 */
export interface WireEnd extends PinRef {
  readonly through?: Heading;
}

/** A wire between two pins. */
export interface WireDoc {
  readonly id: string;
  readonly label: string;
  readonly a: WireEnd;
  readonly b: WireEnd;
  /** Its length, which sets its resistance: a whole jumper, or the share of one on each side of a junction. */
  readonly metres: number;
}

export interface Board {
  readonly version: 1;
  readonly parts: readonly PlacedPart[];
  readonly wires: readonly WireDoc[];
  /** Hands out unique ids; never reused, so undo can't confuse two parts. */
  readonly nextId: number;
}

export const EMPTY_BOARD: Board = { version: 1, parts: [], wires: [], nextId: 1 };

const PREFIX: Readonly<Record<PartKind, string>> = {
  battery: 'B',
  resistor: 'R',
  led: 'D',
  ground: 'GND',
  switch: 'SW',
  button: 'BTN',
  knob: 'RV',
  capacitor: 'C',
  junction: 'J',
};

/** The lowest free label for a kind: R1, then R2… (GND has no number when there's one). */
function freeLabel(taken: readonly string[], prefix: string): string {
  for (let n = 1; ; n++) {
    const label = `${prefix}${String(n)}`;
    if (!taken.includes(label)) return label;
  }
}

export function addPart(
  board: Board,
  kind: PartKind,
  x: number,
  y: number,
  props: Readonly<Record<string, string | number>>,
): { board: Board; id: string } {
  const id = `p${String(board.nextId)}`;
  const label = freeLabel(
    board.parts.map((p) => p.label),
    PREFIX[kind],
  );
  const part: PlacedPart = { id, kind, label, x, y, rotation: 0, props };
  return { board: { ...board, parts: [...board.parts, part], nextId: board.nextId + 1 }, id };
}

export function movePart(board: Board, id: string, x: number, y: number): Board {
  return { ...board, parts: board.parts.map((p) => (p.id === id ? { ...p, x, y } : p)) };
}

export function rotatePart(board: Board, id: string): Board {
  return {
    ...board,
    parts: board.parts.map((p) => (p.id === id ? { ...p, rotation: ((p.rotation + 90) % 360) as Rotation } : p)),
  };
}

export function setProp(board: Board, id: string, key: string, value: string | number): Board {
  return { ...board, parts: board.parts.map((p) => (p.id === id ? { ...p, props: { ...p.props, [key]: value } } : p)) };
}

/** Removes a part and every wire attached to it (for a junction: what was tapped into it). */
export function removePart(board: Board, id: string): Board {
  return removeItems(board, [id], []);
}

export const samePin = (a: PinRef, b: PinRef) => a.part === b.part && a.pin === b.pin;

/** Wires two pins together with a jumper. Wiring a pin to itself, or doubling an existing wire, does nothing. */
export function addWire(board: Board, a: PinRef, b: PinRef): Board {
  if (samePin(a, b)) return board;
  if (board.wires.some((w) => (samePin(w.a, a) && samePin(w.b, b)) || (samePin(w.a, b) && samePin(w.b, a)))) return board;
  const id = `w${String(board.nextId)}`;
  const label = freeLabel(
    board.wires.map((w) => w.label),
    'W',
  );
  const wire: WireDoc = { id, label, a: { part: a.part, pin: a.pin }, b: { part: b.part, pin: b.pin }, metres: JUMPER.lengthMetres };
  return { ...board, wires: [...board.wires, wire], nextId: board.nextId + 1 };
}

export function removeWire(board: Board, id: string): Board {
  return tidyJunctions({ ...board, wires: board.wires.filter((w) => w.id !== id) });
}

/* Tapping into wires */

/**
 * A point partway along a wire: `t` is the fraction of the way from its first
 * end, `axis` the way it runs there, `heading` the way it runs towards its second end.
 */
export interface Tap {
  readonly wire: string;
  readonly at: Point;
  readonly t: number;
  readonly axis: 'h' | 'v';
  readonly heading: Heading;
}

/** Where a wire end lands: on a pin, or on a point partway along another wire. */
export type Landing = { readonly pin: PinRef } | { readonly tap: Tap };

/** A wire cut in two at a junction: which wire, how far along, the two halves that replaced it, and the junction. */
export interface Split {
  readonly wire: string;
  readonly t: number;
  readonly halves: readonly [string, string];
  readonly junction: PinRef;
}

/**
 * Cuts a wire in two at a junction. The halves share its length in the same
 * proportion as the drawing (`t` of it on the first side), so together they
 * have exactly the original resistance.
 */
export function splitWire(board: Board, tap: Tap): { board: Board; split: Split } | undefined {
  const wire = board.wires.find((w) => w.id === tap.wire);
  if (!wire || !(tap.t > 0 && tap.t < 1)) return undefined;
  const added = addPart(board, 'junction', tap.at.x, tap.at.y, { axis: tap.axis });
  const junction: PinRef = { part: added.id, pin: 'pin' };
  const next = added.board;
  const halves = [`w${String(next.nextId)}`, `w${String(next.nextId + 1)}`] as const;
  const second = freeLabel(
    next.wires.map((w) => w.label),
    'W',
  );
  const first: WireDoc = {
    id: halves[0],
    label: wire.label,
    a: wire.a,
    b: { ...junction, through: OPPOSITE[tap.heading] },
    metres: wire.metres * tap.t,
  };
  const rest: WireDoc = {
    id: halves[1],
    label: second,
    a: { ...junction, through: tap.heading },
    b: wire.b,
    metres: wire.metres * (1 - tap.t),
  };
  return {
    board: { ...next, wires: [...next.wires.filter((w) => w.id !== wire.id), first, rest], nextId: next.nextId + 2 },
    split: { wire: wire.id, t: tap.t, halves, junction },
  };
}

/**
 * Runs a new jumper between two landings, putting a junction wherever one
 * lands partway along a wire. One change, so one undo takes it all back.
 */
export function connect(board: Board, a: Landing, b: Landing): { board: Board; splits: Split[] } {
  const splits: Split[] = [];
  let next = board;
  const land = (landing: Landing, onto?: { split: Split; scale: number }): PinRef | undefined => {
    if ('pin' in landing) return landing.pin;
    // A second tap on a wire the first one cut lands on the first half, at its share of that half.
    const tap = onto ? { ...landing.tap, wire: onto.split.halves[0], t: landing.tap.t / onto.scale } : landing.tap;
    const done = splitWire(next, tap);
    if (!done) return undefined;
    next = done.board;
    splits.push(done.split);
    return done.split.junction;
  };

  let endA: PinRef | undefined;
  let endB: PinRef | undefined;
  if ('tap' in a && 'tap' in b && a.tap.wire === b.tap.wire) {
    if (a.tap.t === b.tap.t) return { board, splits };
    const [far, near] = a.tap.t > b.tap.t ? [a, b] : [b, a];
    const farEnd = land(far);
    const split = splits.at(0);
    const nearEnd = split ? land(near, { split, scale: far.tap.t }) : undefined;
    [endA, endB] = far === a ? [farEnd, nearEnd] : [nearEnd, farEnd];
  } else {
    endA = land(a);
    endB = land(b);
  }
  if (!endA || !endB) return { board, splits: [] };
  const wired = addWire(next, endA, endB);
  // A wire that would only double one already there (from a point on a wire to its own end, say) changes
  // nothing: the board stays exactly as it was, with no junctions left behind and nothing to undo.
  if (wired === next) return { board, splits: [] };
  return { board: tidyJunctions(wired), splits };
}

const touches = (wire: WireDoc, part: string) => wire.a.part === part || wire.b.part === part;

/**
 * Keeps junctions honest after wires go: one with nothing left on it goes too,
 * and one left joining only the two halves of a wire it cut heals back into
 * that one wire, with its whole length.
 */
export function tidyJunctions(board: Board): Board {
  let next = board;
  for (const junction of board.parts.filter((p) => p.kind === 'junction')) {
    const wires = next.wires.filter((w) => touches(w, junction.id));
    if (wires.length === 0) {
      next = { ...next, parts: next.parts.filter((p) => p.id !== junction.id) };
      continue;
    }
    if (wires.length !== 2) continue;
    const [first, second] = wires;
    const at = (w: WireDoc) => (w.a.part === junction.id ? w.a : w.b);
    const away = (w: WireDoc) => (w.a.part === junction.id ? w.b : w.a);
    if (!at(first).through || !at(second).through) continue;
    const healed: WireDoc = {
      id: `w${String(next.nextId)}`,
      label: first.label,
      a: away(first),
      b: away(second),
      metres: first.metres + second.metres,
    };
    next = {
      ...next,
      parts: next.parts.filter((p) => p.id !== junction.id),
      wires: [...next.wires.filter((w) => w !== first && w !== second), ...(samePin(healed.a, healed.b) ? [] : [healed])],
      nextId: next.nextId + 1,
    };
  }
  return next;
}

/* Groups: what multi-select acts on. Each is one change, so one undo puts it all back. */

/** Moves every part in `ids` by the same amount; their wires follow because wires join pins. */
export function moveParts(board: Board, ids: readonly string[], dx: number, dy: number): Board {
  if (ids.length === 0 || (dx === 0 && dy === 0)) return board;
  return { ...board, parts: board.parts.map((p) => (ids.includes(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p)) };
}

/** Turns every part in `ids` a quarter, each about its own centre. */
export function rotateParts(board: Board, ids: readonly string[]): Board {
  if (ids.length === 0) return board;
  return {
    ...board,
    parts: board.parts.map((p) => (ids.includes(p.id) ? { ...p, rotation: ((p.rotation + 90) % 360) as Rotation } : p)),
  };
}

/** Removes the parts (and every wire on them) and the wires. */
export function removeItems(board: Board, parts: readonly string[], wires: readonly string[]): Board {
  if (parts.length === 0 && wires.length === 0) return board;
  // Taking a junction away means taking away what was tapped into it: the wire it cut then heals back into one.
  const junctions = parts.filter((id) => board.parts.some((p) => p.id === id && p.kind === 'junction'));
  const others = parts.filter((id) => !junctions.includes(id));
  const tappedIn = (w: WireDoc) => junctions.some((j) => (w.a.part === j && !w.a.through) || (w.b.part === j && !w.b.through));
  let next = tidyJunctions({
    ...board,
    parts: board.parts.filter((p) => !others.includes(p.id)),
    wires: board.wires.filter((w) => !wires.includes(w.id) && !tappedIn(w) && !others.includes(w.a.part) && !others.includes(w.b.part)),
  });
  // A junction that couldn't heal (half its wire already gone) goes anyway, with whatever is left on it.
  const left = junctions.filter((j) => next.parts.some((p) => p.id === j));
  if (left.length > 0) {
    next = tidyJunctions({
      ...next,
      parts: next.parts.filter((p) => !left.includes(p.id)),
      wires: next.wires.filter((w) => !left.includes(w.a.part) && !left.includes(w.b.part)),
    });
  }
  return next;
}

/** Copied parts, and the wires between them, as they were on the board. */
export interface Clip {
  readonly parts: readonly PlacedPart[];
  readonly wires: readonly WireDoc[];
}

/** Copies parts, with every wire whose two ends are both among them. */
export function copyParts(board: Board, ids: readonly string[]): Clip {
  const parts = board.parts.filter((p) => ids.includes(p.id));
  const wires = board.wires.filter((w) => ids.includes(w.a.part) && ids.includes(w.b.part));
  return { parts, wires };
}

/**
 * Pastes a clip shifted by (dx, dy): new ids, the next free labels, and its
 * wires rewired to the new parts. Returns the board and the new parts' and wires' ids.
 */
export function pasteClip(board: Board, clip: Clip, dx: number, dy: number): { board: Board; parts: string[]; wires: string[] } {
  let nextId = board.nextId;
  const labels = board.parts.map((p) => p.label);
  const wireLabels = board.wires.map((w) => w.label);
  const renamed = new Map<string, string>();
  const parts = clip.parts.map((part): PlacedPart => {
    const id = `p${String(nextId++)}`;
    const label = freeLabel(labels, PREFIX[part.kind]);
    labels.push(label);
    renamed.set(part.id, id);
    return { ...part, id, label, x: part.x + dx, y: part.y + dy };
  });
  const wires = clip.wires.flatMap((wire): WireDoc[] => {
    const a = renamed.get(wire.a.part);
    const b = renamed.get(wire.b.part);
    if (a === undefined || b === undefined) return [];
    const label = freeLabel(wireLabels, 'W');
    wireLabels.push(label);
    return [{ id: `w${String(nextId++)}`, label, a: { ...wire.a, part: a }, b: { ...wire.b, part: b }, metres: wire.metres }];
  });
  return {
    board: { ...board, parts: [...board.parts, ...parts], wires: [...board.wires, ...wires], nextId },
    parts: parts.map((p) => p.id),
    wires: wires.map((w) => w.id),
  };
}

/**
 * Which pins are wired together. Each pin belongs to one net: every pin
 * reachable from it along wires, through any junctions on the way. Two pins
 * in the same net are the same point in the circuit (give or take the wires'
 * few milliohms). Returns a function naming a pin's net; a pin with nothing
 * wired to it is a net of its own.
 */
export function netsOf(board: Board): (ref: PinRef) => string {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let root = key;
    for (let up = parent.get(root); up !== undefined && up !== root; up = parent.get(root)) root = up;
    if (root !== key) parent.set(key, root);
    return root;
  };
  const key = (ref: PinRef) => `${ref.part}.${ref.pin}`;
  for (const wire of board.wires) {
    const a = find(key(wire.a));
    const b = find(key(wire.b));
    if (a !== b) parent.set(a, b);
  }
  return (ref) => find(key(ref));
}
