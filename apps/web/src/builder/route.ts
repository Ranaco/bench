import type { Box } from '../components/useCamera';
import type { Point } from '../geometry';
import { HEADINGS, type Board, type Heading, type PinRef, type PlacedPart, type WireDoc, type WireEnd } from './board';
import type { Selection } from './selection';
import { CATALOG, GRID, pinAt, rotate } from './catalog';

/** How a wire is drawn: out of each pin the way the pin faces, then one turn to meet. */

/** Which way a pin faces before its part is turned: out of the part, away from its centre. */
function facingOf(pin: Point): Point {
  return Math.abs(pin.x) >= Math.abs(pin.y) ? { x: Math.sign(pin.x), y: 0 } : { x: 0, y: Math.sign(pin.y) || -1 };
}

/** Which way a pin faces on the board, as a unit step. */
export function pinFacing(part: PlacedPart, pinId: string): Point {
  const pin = CATALOG[part.kind].pins.find((p) => p.id === pinId);
  return pin ? rotate(facingOf(pin), part.rotation) : { x: 0, y: -1 };
}

/** Drops repeated points and points on a straight line between their neighbours (including doubling back). */
export function simplify(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const last = out.at(-1);
    if (last?.x === point.x && last.y === point.y) continue;
    const before = out.at(-2);
    if (before && last && (before.x - last.x) * (last.y - point.y) === (before.y - last.y) * (last.x - point.x)) out.pop();
    out.push(point);
  }
  return out;
}

const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const towards = (from: Point, to: Point) => ({ x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) });

/**
 * A wire's path between two pins, as a polyline on the grid: a short step out
 * of each pin, the way it faces, then one turn to meet (or, when every one-turn
 * path would double back through a part or run along the wire at a junction,
 * two turns with a jog halfway). A junction end has no part to step clear of
 * (`stub` 0), so it must leave, or be reached, exactly the way it faces.
 */
export function routeBetween(
  a: Point,
  facingA: Point | undefined,
  b: Point,
  facingB: Point | undefined,
  stub: { readonly a: number; readonly b: number } = { a: GRID, b: GRID },
): Point[] {
  const outA = facingA ? { x: a.x + facingA.x * stub.a, y: a.y + facingA.y * stub.a } : a;
  const outB = facingB ? { x: b.x + facingB.x * stub.b, y: b.y + facingB.y * stub.b } : b;
  const mid = { x: Math.round((outA.x + outB.x) / 2 / GRID) * GRID, y: Math.round((outA.y + outB.y) / 2 / GRID) * GRID };
  // All else equal, carry on the way A faces; with A free, arrive along the way B faces.
  const verticalFirst = facingA ? facingA.x === 0 : facingB ? facingB.x !== 0 : true;
  const oneTurn = [
    [outA, { x: outA.x, y: outB.y }, outB],
    [outA, { x: outB.x, y: outA.y }, outB],
  ];
  const twoTurns = [
    [outA, { x: outA.x, y: mid.y }, { x: outB.x, y: mid.y }, outB],
    [outA, { x: mid.x, y: outA.y }, { x: mid.x, y: outB.y }, outB],
  ];
  const candidates = [...(verticalFirst ? oneTurn : oneTurn.reverse()), ...(verticalFirst ? twoTurns : twoTurns.reverse())];

  /** Leaving A against the way it faces, or reaching B along the way it faces, runs back over the part. */
  const penalty = (path: readonly Point[]) => {
    const steps = path.slice(1).map((to, i) => towards(path[i], to)).filter((d) => d.x !== 0 || d.y !== 0);
    const first = steps.at(0);
    const last = steps.at(-1);
    if (!first || !last) return 0;
    const leaving = facingA ? dot(first, facingA) : 1;
    const reaching = facingB ? dot(last, facingB) : -1;
    return Number(stub.a === 0 ? leaving <= 0 : leaving < 0) + Number(stub.b === 0 ? reaching >= 0 : reaching > 0);
  };
  // A two-turn path only wins when it's actually better: ties go to the simpler one.
  const scored = candidates.map((path, i) => ({ path, score: penalty(path) + (i >= 2 ? 0.5 : 0) }));
  const best = scored.reduce((winner, next) => (next.score < winner.score ? next : winner));
  return simplify([a, ...best.path, b]);
}

/** The way a junction's wire ran when it was cut, turned with the junction. */
function junctionAxis(part: PlacedPart): Point {
  return rotate(part.props.axis === 'v' ? { x: 0, y: 1 } : { x: 1, y: 0 }, part.rotation);
}

/**
 * Which way a wire leaves a junction: the way it ran when it was cut, for the
 * two halves (`through`), turned with the junction; off to the side, towards
 * its other end, for a wire tapped in, so it never runs on top of the one it joins.
 */
function junctionFacing(part: PlacedPart, end: WireEnd, other: Point): Point | undefined {
  if (end.through) return rotate(HEADINGS[end.through], part.rotation);
  const along = junctionAxis(part);
  const across = { x: along.y, y: along.x };
  const toward = (axis: Point) => {
    const sign = Math.sign((other.x - part.x) * axis.x + (other.y - part.y) * axis.y);
    return sign === 0 ? undefined : { x: axis.x * sign, y: axis.y * sign };
  };
  return toward(across) ?? toward(along);
}

/**
 * A wire from one of a part's pins to another of its own (a battery shorted by a
 * wire, say): it loops round the outside of the part, on the side away from its
 * label, so it's always in plain sight and can be clicked.
 */
export function selfRoute(part: PlacedPart, pinA: string, pinB: string): Point[] | undefined {
  const { box, pins } = CATALOG[part.kind];
  const a = pins.find((p) => p.id === pinA);
  const b = pins.find((p) => p.id === pinB);
  if (!a || !b) return undefined;
  const out = (pin: Point) => {
    const facing = facingOf(pin);
    return { x: pin.x + facing.x * GRID, y: pin.y + facing.y * GRID };
  };
  const [outA, outB] = [out(a), out(b)];
  // Worked out unturned, then turned with the part: left of a tall part, under a wide one (labels go right and above).
  const tall = box.height >= box.width;
  const left = Math.floor(box.x / GRID) * GRID - GRID;
  const below = Math.ceil((box.y + box.height) / GRID) * GRID + GRID;
  const local = tall
    ? [a, outA, { x: left, y: outA.y }, { x: left, y: outB.y }, outB, b]
    : [a, outA, { x: outA.x, y: below }, { x: outB.x, y: below }, outB, b];
  return simplify(
    local.map((p) => {
      const turned = rotate(p, part.rotation);
      return { x: part.x + turned.x, y: part.y + turned.y };
    }),
  );
}

export function wireRoute(parts: ReadonlyMap<string, PlacedPart>, wire: WireDoc): Point[] | undefined {
  const a = parts.get(wire.a.part);
  const b = parts.get(wire.b.part);
  if (!a || !b) return undefined;
  if (a === b) return selfRoute(a, wire.a.pin, wire.b.pin);
  const atA = pinAt(a, wire.a.pin);
  const atB = pinAt(b, wire.b.pin);
  const facing = (part: PlacedPart, end: WireEnd, other: Point) =>
    part.kind === 'junction' ? junctionFacing(part, end, other) : pinFacing(part, end.pin);
  const stub = (part: PlacedPart) => (part.kind === 'junction' ? 0 : GRID);
  return routeBetween(atA, facing(a, wire.a, atB), atB, facing(b, wire.b, atA), { a: stub(a), b: stub(b) });
}

const lengthOf = (points: readonly Point[]) =>
  points.slice(1).reduce((sum, end, i) => sum + Math.hypot(end.x - points[i].x, end.y - points[i].y), 0);

/** The point a fraction `t` of the way along a route, by length. */
export function pointAlong(points: readonly Point[], t: number): Point {
  let left = lengthOf(points) * Math.min(1, Math.max(0, t));
  for (let i = 1; i < points.length; i++) {
    const [from, to] = [points[i - 1], points[i]];
    const step = Math.hypot(to.x - from.x, to.y - from.y);
    if (left <= step && step > 0) return { x: from.x + ((to.x - from.x) * left) / step, y: from.y + ((to.y - from.y) * left) / step };
    left -= step;
  }
  return points.at(-1) ?? { x: 0, y: 0 };
}

/**
 * The point on a route nearest `p`: where it is, how far away, the fraction of
 * the route's length it sits at, which straight run it's on, and which way that runs.
 */
export function nearestOnRoute(
  points: readonly Point[],
  p: Point,
): { point: Point; distance: number; t: number; segment: number; axis: 'h' | 'v' } {
  const total = lengthOf(points) || 1;
  let best = { point: points[0], distance: Infinity, t: 0, segment: 1, axis: 'h' as 'h' | 'v' };
  let travelled = 0;
  for (let i = 1; i < points.length; i++) {
    const [from, to] = [points[i - 1], points[i]];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const step = Math.hypot(dx, dy);
    const s = step === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - from.x) * dx + (p.y - from.y) * dy) / (step * step)));
    const point = { x: from.x + s * dx, y: from.y + s * dy };
    const distance = Math.hypot(p.x - point.x, p.y - point.y);
    if (distance < best.distance) {
      best = { point, distance, t: (travelled + s * step) / total, segment: i, axis: Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v' };
    }
    travelled += step;
  }
  return best;
}

/**
 * Where a junction would go to tap a route near `p`: the nearest grid point
 * strictly inside one of its straight runs. Never on a bend, where it couldn't
 * tell which way the wire runs, and never at an end, where it would just be
 * that pin: undefined when there's no such point (a run too short to tap).
 */
export function tapPoint(points: readonly Point[], p: Point): { at: Point; t: number; axis: 'h' | 'v'; heading: Heading } | undefined {
  const near = nearestOnRoute(points, p);
  const from = points[near.segment - 1];
  const to = points[near.segment];
  // Runs go along grid lines, so stepping in whole grid squares from a bend stays on the wire.
  const key = near.axis === 'h' ? 'x' : 'y';
  const low = Math.min(from[key], to[key]) + GRID;
  const high = Math.max(from[key], to[key]) - GRID;
  if (low > high) return undefined;
  const along = Math.min(high, Math.max(low, snapTo(near.point[key])));
  const at = key === 'x' ? { x: along, y: from.y } : { x: from.x, y: along };
  const forward = key === 'x' ? to.x > from.x : to.y > from.y;
  const heading: Heading = key === 'x' ? (forward ? 'right' : 'left') : forward ? 'down' : 'up';
  return { at, t: nearestOnRoute(points, at).t, axis: near.axis, heading };
}

const snapTo = (value: number) => Math.round(value / GRID) * GRID;

/** An SVG path through `points`, with its corners rounded. */
export function roundedPath(points: readonly Point[], radius = 8): string {
  const n = (value: number) => String(Math.round(value * 100) / 100);
  if (points.length === 0) return '';
  let d = `M${n(points[0].x)},${n(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    const here = points[i];
    const next = points.at(i + 1);
    if (!next) {
      d += ` L${n(here.x)},${n(here.y)}`;
      break;
    }
    const prev = points[i - 1];
    const inLength = Math.hypot(here.x - prev.x, here.y - prev.y);
    const outLength = Math.hypot(next.x - here.x, next.y - here.y);
    const r = Math.min(radius, inLength / 2, outLength / 2);
    const enter = { x: here.x - ((here.x - prev.x) / inLength) * r, y: here.y - ((here.y - prev.y) / inLength) * r };
    const leave = { x: here.x + ((next.x - here.x) / outLength) * r, y: here.y + ((next.y - here.y) / outLength) * r };
    d += ` L${n(enter.x)},${n(enter.y)} Q${n(here.x)},${n(here.y)} ${n(leave.x)},${n(leave.y)}`;
  }
  return d;
}

/** A part's box on the board, turned with it. */
export function partBox(part: PlacedPart): Box {
  const { box } = CATALOG[part.kind];
  const corners = [
    rotate({ x: box.x, y: box.y }, part.rotation),
    rotate({ x: box.x + box.width, y: box.y + box.height }, part.rotation),
  ];
  const x = Math.min(corners[0].x, corners[1].x);
  const y = Math.min(corners[0].y, corners[1].y);
  const turned = part.rotation % 180 !== 0;
  return { x: part.x + x, y: part.y + y, width: turned ? box.height : box.width, height: turned ? box.width : box.height };
}

/** The smallest box around every part, with room for labels, or undefined for an empty board. */
export function boardBounds(board: Board, margin = 60): Box | undefined {
  if (board.parts.length === 0) return undefined;
  const boxes = board.parts.map(partBox);
  const left = Math.min(...boxes.map((b) => b.x)) - margin;
  const top = Math.min(...boxes.map((b) => b.y)) - margin;
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + margin;
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + margin;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * The grid spot nearest `near` where a new part of `kind` doesn't sit on top
 * of another, searching outward ring by ring.
 */
export function freeSpot(board: Board, kind: PlacedPart['kind'], near: Point): Point {
  const step = 2 * GRID;
  const start = { x: Math.round(near.x / GRID) * GRID, y: Math.round(near.y / GRID) * GRID };
  const fits = (at: Point) => {
    const box = partBox({ id: '', kind, label: '', x: at.x, y: at.y, rotation: 0, props: {} });
    const roomy = { x: box.x - GRID, y: box.y - GRID, width: box.width + 2 * GRID, height: box.height + 2 * GRID };
    return board.parts.every((p) => !overlaps(roomy, partBox(p)));
  };
  for (let ring = 0; ring < 30; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const at = { x: start.x + dx * step, y: start.y + dy * step };
        if (fits(at)) return at;
      }
    }
  }
  return start;
}

/** Space between a part's box and its label: clear of the selection outline drawn around the box. */
const LABEL_GAP = 20;

/** Where a part's name and value go: beside it, and always upright whichever way it's turned. */
export function labelSpot(part: PlacedPart): { at: Point; anchor: 'start' | 'middle' | 'end'; stack: 'up' | 'down' | 'centre' } {
  const box = CATALOG[part.kind].box;
  // Unturned, labels sit to the right of tall parts and above wide ones.
  const tall = box.height >= box.width;
  const offset = tall ? { x: box.x + box.width + LABEL_GAP, y: 0 } : { x: 0, y: box.y - LABEL_GAP };
  const turned = rotate(offset, part.rotation);
  const at = { x: part.x + turned.x, y: part.y + turned.y };
  if (turned.x > 1) return { at, anchor: 'start', stack: 'centre' };
  if (turned.x < -1) return { at, anchor: 'end', stack: 'centre' };
  return { at, anchor: 'middle', stack: turned.y < 0 ? 'up' : 'down' };
}

/** Every pin on the board, where it is. */
export function pinsOf(parts: Iterable<PlacedPart>): { ref: PinRef; at: Point; part: PlacedPart }[] {
  const pins = [];
  for (const part of parts) {
    for (const pin of CATALOG[part.kind].pins) pins.push({ ref: { part: part.id, pin: pin.id }, at: pinAt(part, pin.id), part });
  }
  return pins;
}

/** The pin nearest `point` within `reach`, if any. */
export function pinNear(parts: Iterable<PlacedPart>, point: Point, reach: number): PinRef | undefined {
  let best: { ref: PinRef; distance: number } | undefined;
  for (const pin of pinsOf(parts)) {
    const distance = Math.hypot(pin.at.x - point.x, pin.at.y - point.y);
    if (distance <= reach && (!best || distance < best.distance)) best = { ref: pin.ref, distance };
  }
  return best?.ref;
}

/** A box from two corners, in either order. */
export function boxBetween(a: Point, b: Point): Box {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/**
 * What a selection box catches: every part whose box it touches, and every
 * wire with a stretch inside it. Wire routes are straight runs along the grid,
 * so a stretch is inside when its own thin box overlaps.
 */
export function inBox(
  parts: Iterable<PlacedPart>,
  wires: Iterable<{ readonly id: string; readonly points: readonly Point[] }>,
  box: Box,
): Selection {
  const touches = (b: Box) => b.x <= box.x + box.width && box.x <= b.x + b.width && b.y <= box.y + box.height && box.y <= b.y + b.height;
  const hitParts = [...parts].filter((part) => touches(partBox(part))).map((part) => part.id);
  const hitWires = [...wires]
    .filter((wire) => wire.points.slice(1).some((end, i) => touches(boxBetween(wire.points[i], end))))
    .map((wire) => wire.id);
  return { parts: hitParts, wires: hitWires };
}
