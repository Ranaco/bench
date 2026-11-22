import type { Board } from './board';

/** What's selected on the board: any number of parts and wires. */
export interface Selection {
  readonly parts: readonly string[];
  readonly wires: readonly string[];
}

export type ItemKind = 'part' | 'wire';

export const NOTHING: Selection = { parts: [], wires: [] };

export const isEmpty = (selection: Selection) => selection.parts.length === 0 && selection.wires.length === 0;

export const size = (selection: Selection) => selection.parts.length + selection.wires.length;

export const only = (kind: ItemKind, id: string): Selection =>
  kind === 'part' ? { parts: [id], wires: [] } : { parts: [], wires: [id] };

export const includes = (selection: Selection, kind: ItemKind, id: string) =>
  (kind === 'part' ? selection.parts : selection.wires).includes(id);

/** Adds an item, or takes it out if it's already in: Shift- or Ctrl-click. */
export function toggle(selection: Selection, kind: ItemKind, id: string): Selection {
  const list = kind === 'part' ? selection.parts : selection.wires;
  const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  return kind === 'part' ? { ...selection, parts: next } : { ...selection, wires: next };
}

/** Everything in either selection. */
export function union(a: Selection, b: Selection): Selection {
  return { parts: [...new Set([...a.parts, ...b.parts])], wires: [...new Set([...a.wires, ...b.wires])] };
}

/** Everything on the board. */
export const all = (board: Board): Selection => ({ parts: board.parts.map((p) => p.id), wires: board.wires.map((w) => w.id) });

/** The selection without anything that's left the board (after an undo, say). The same object when nothing has. */
export function prune(board: Board, selection: Selection): Selection {
  const parts = selection.parts.filter((id) => board.parts.some((p) => p.id === id));
  const wires = selection.wires.filter((id) => board.wires.some((w) => w.id === id));
  return parts.length === selection.parts.length && wires.length === selection.wires.length ? selection : { parts, wires };
}
