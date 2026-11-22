import { JUMPER } from '@bench/engine';
import type { Board, PartKind, PlacedPart, Rotation, WireDoc, WireEnd } from './board';
import { CATALOG } from './catalog';

/**
 * Saving and loading the board. A saved board is checked part by part, so a
 * board saved by an older or newer Bench loads what it can instead of
 * crashing: unknown parts are dropped, and so are wires to pins that aren't there.
 */

const ROTATIONS: readonly number[] = [0, 90, 180, 270];

type Loose = Record<string, unknown>;

const isObject = (value: unknown): value is Loose => typeof value === 'object' && value !== null && !Array.isArray(value);
const isKind = (value: unknown): value is PartKind => typeof value === 'string' && Object.hasOwn(CATALOG, value);

function readPart(value: unknown): PlacedPart | undefined {
  if (!isObject(value) || !isKind(value.kind)) return undefined;
  const { id, label, x, y, rotation, props } = value;
  if (typeof id !== 'string' || typeof label !== 'string') return undefined;
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  if (typeof rotation !== 'number' || !ROTATIONS.includes(rotation)) return undefined;
  // Start from the kind's defaults, so a setting added later still has a value.
  const settings: Record<string, string | number> = { ...CATALOG[value.kind].defaults };
  if (isObject(props)) {
    for (const key of Object.keys(settings)) {
      const saved = props[key];
      if (typeof saved === typeof settings[key]) settings[key] = saved as string | number;
    }
  }
  return { id, kind: value.kind, label, x, y, rotation: rotation as Rotation, props: settings };
}

function readPin(value: unknown, parts: ReadonlyMap<string, PlacedPart>): WireEnd | undefined {
  if (!isObject(value) || typeof value.part !== 'string' || typeof value.pin !== 'string') return undefined;
  const part = parts.get(value.part);
  if (!part || !CATALOG[part.kind].pins.some((pin) => pin.id === value.pin)) return undefined;
  const through = value.through;
  return through === 'up' || through === 'down' || through === 'left' || through === 'right'
    ? { part: value.part, pin: value.pin, through }
    : { part: value.part, pin: value.pin };
}

/** Reads a saved board back, or undefined if it isn't one. */
export function parseBoard(text: string | null): Board | undefined {
  if (!text) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.parts) || !Array.isArray(value.wires)) {
    return undefined;
  }

  const parts = new Map<string, PlacedPart>();
  for (const raw of value.parts) {
    const part = readPart(raw);
    if (part && !parts.has(part.id)) parts.set(part.id, part);
  }
  const wires: WireDoc[] = [];
  for (const raw of value.wires) {
    if (!isObject(raw) || typeof raw.id !== 'string' || typeof raw.label !== 'string') continue;
    const a = readPin(raw.a, parts);
    const b = readPin(raw.b, parts);
    // Boards saved before wires had a length were all whole jumpers.
    const metres = typeof raw.metres === 'number' && raw.metres > 0 && Number.isFinite(raw.metres) ? raw.metres : JUMPER.lengthMetres;
    if (a && b && !wires.some((w) => w.id === raw.id)) wires.push({ id: raw.id, label: raw.label, a, b, metres });
  }

  // Ids must never repeat, whatever the saved counter says.
  const used = [...parts.keys(), ...wires.map((w) => w.id)].map((id) => Number(id.slice(1))).filter(Number.isFinite);
  const saved = typeof value.nextId === 'number' && Number.isInteger(value.nextId) ? value.nextId : 1;
  const nextId = Math.max(saved, ...used.map((n) => n + 1));
  return { version: 1, parts: [...parts.values()], wires, nextId };
}

/** Reads the board saved under `key` (each lesson keeps its own, apart from Build's). */
export function loadBoard(key: string): Board | undefined {
  try {
    return parseBoard(window.localStorage.getItem(key));
  } catch {
    return undefined; // Private windows can refuse storage.
  }
}

export function saveBoard(key: string, board: Board): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(board));
  } catch {
    // Private windows can refuse storage; the board just won't be there next time.
  }
}
