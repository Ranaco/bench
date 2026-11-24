import type { Point } from '../geometry';
import { KINDS } from '../kinds/models';
import type { PartKind, PlacedPart, Rotation } from './board';

export type { KindModel as KindDef, PinDef } from '../kinds/kind';

/** Board spacing: every pin sits on this grid, so wires always meet pins exactly. */
export const GRID = 20;

/** Every kind of part, by its kind: its pins, size and settings, and how it's built (see kinds/). */
export const CATALOG = KINDS;

export const PALETTE: readonly PartKind[] = ['battery', 'resistor', 'led', 'switch', 'button', 'knob', 'capacitor', 'transistor', 'esp32', 'ground'];

/** Rotates a point about the origin by a multiple of 90°. */
export function rotate(p: Point, rotation: Rotation): Point {
  switch (rotation) {
    case 0:
      return p;
    case 90:
      return { x: -p.y, y: p.x };
    case 180:
      return { x: -p.x, y: -p.y };
    case 270:
      return { x: p.y, y: -p.x };
  }
}

/** Where a pin of a placed part sits on the board. */
export function pinAt(part: PlacedPart, pinId: string): Point {
  const pin = CATALOG[part.kind].pins.find((p) => p.id === pinId);
  if (!pin) return { x: part.x, y: part.y };
  const r = rotate(pin, part.rotation);
  return { x: part.x + r.x, y: part.y + r.y };
}

export const snap = (value: number) => Math.round(value / GRID) * GRID;
