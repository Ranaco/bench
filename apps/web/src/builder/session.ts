import { createContext, use, useEffect, useRef, useState, type RefObject } from 'react';
import type { Point } from '../geometry';
import {
  addPart,
  connect,
  copyParts,
  EMPTY_BOARD,
  moveParts,
  pasteClip,
  removeItems,
  rotateParts,
  setProp,
  type Board,
  type Clip,
  type PartKind,
  type Landing,
} from './board';
import type { CanvasApi } from './BoardCanvas';
import { CATALOG, GRID, snap } from './catalog';
import { freeSpot, partBox } from './route';
import { afterSplits, METER_START, type MeterMode, type MeterState, type ProbeTarget, type Tool } from './meter';
import { loadBoard, saveBoard } from './save';
import { all, isEmpty, NOTHING, prune, type Selection } from './selection';
import { BoardSim } from './sync';
import { WorkerTransport } from '../program/transport';
import { useHistory } from './useHistory';

/**
 * One board being built: its document and undo history, the live circuit, and
 * what's selected. Every window (board, parts, inspector, graph, lesson) reads
 * the same session, so they all stay in step however they're arranged.
 */
export interface Session {
  readonly board: Board;
  readonly sim: BoardSim;
  /** The parts this board may use: everything in Build, what the lesson has unlocked in a lesson. */
  readonly parts: readonly PartKind[];
  readonly selection: Selection;
  readonly select: (selection: Selection) => void;
  /** A part being carried in from the parts box, drawn where it would land. */
  readonly ghost: { readonly kind: PartKind; readonly at: Point } | undefined;
  readonly canvas: RefObject<CanvasApi | null>;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undo: () => void;
  readonly redo: () => void;

  /** The parts box: carrying a part over the screen, dropping it, or giving up. */
  readonly carry: (kind: PartKind, clientX: number, clientY: number) => void;
  readonly drop: (kind: PartKind, clientX: number, clientY: number, dragged: boolean) => void;
  readonly cancelCarry: () => void;
  /** Puts a new part at a board point (from the right-click menu), and selects it. */
  readonly addPart: (kind: PartKind, at: Point) => void;

  readonly moveParts: (ids: readonly string[], dx: number, dy: number) => void;
  /** Runs a wire between two landings: pins, or points along wires (each gets a junction). */
  readonly connect: (a: Landing, b: Landing) => void;
  /** Turns the given parts, or every selected part. */
  readonly rotate: (ids?: readonly string[]) => void;
  readonly setProp: (id: string, key: string, value: string | number) => void;
  /** Removes everything selected, in one undo step. */
  readonly remove: () => void;
  readonly duplicate: () => void;
  readonly copy: () => void;
  readonly canPaste: boolean;
  /** Pastes what was copied: at a board point, or just beside where it came from. */
  readonly paste: (at?: Point) => void;
  readonly selectAll: () => void;
  /** Swaps a burnt part for a fresh one. */
  readonly replace: (id: string) => void;
  readonly clear: () => void;

  /** Slides a slide switch to its other side: an edit to the board, so it's saved and can be undone. */
  readonly flip: (id: string) => void;
  /** A finger (or the mouse) pressing a push button down, or letting it go. */
  readonly press: (id: string, down: boolean) => void;
  /** Push buttons kept held down from the menu or the Inspector, so more than one can be down with a mouse. */
  readonly holds: ReadonlySet<string>;
  readonly setHold: (id: string, held: boolean) => void;

  /** The multimeter: its mode and where its leads are. */
  readonly meter: MeterState;
  readonly setMeterMode: (mode: MeterMode) => void;
  /** Puts a lead on a pin or a wire, or back in its socket (undefined). */
  readonly placeLead: (tool: Tool, target: ProbeTarget | undefined) => void;
  readonly stowLeads: () => void;
  /** Guess before measuring: the meter hides each new reading until you've guessed. */
  readonly guessFirst: boolean;
  readonly setGuessFirst: (on: boolean) => void;
  readonly guesses: Readonly<Partial<Record<string, GuessRecord>>>;
  readonly reveal: (key: string, record: GuessRecord) => void;
  readonly forget: (key: string) => void;
}

/** A guess at a reading, and what the meter then showed. */
export interface GuessRecord {
  readonly guess: number | undefined;
  readonly actual: number;
}

const GUESS_KEY = 'bench.guessFirst';
const TOOLS: readonly Tool[] = ['red', 'black', 'clamp'];

function storedGuessFirst(): boolean {
  try {
    return window.localStorage.getItem(GUESS_KEY) !== 'off';
  } catch {
    return true;
  }
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = use(SessionContext);
  if (!session) throw new Error('useSession() needs a SessionContext above it');
  return session;
}

/** Longest step taken in one frame, so a backgrounded tab doesn't leap ahead. */
const MAX_DT = 0.05;
/** How far a duplicate or a pasted copy lands from the last one: two grid squares down and right. */
const COPY_OFFSET = 2 * GRID;

const ARROWS: Readonly<Partial<Record<string, Point>>> = {
  arrowleft: { x: -GRID, y: 0 },
  arrowright: { x: GRID, y: 0 },
  arrowup: { x: 0, y: -GRID },
  arrowdown: { x: 0, y: GRID },
};

/** What was last copied, kept across modes and lessons; `pastes` counts the copies made, to stagger them. */
let clipboard: { clip: Clip; pastes: number } | undefined;

/** The clip without parts this board can't use, and without wires to them. */
function allowedClip(clip: Clip, kinds: readonly PartKind[]): Clip {
  // Junctions come with the wires they join: they're never in the parts box, but always allowed.
  const parts = clip.parts.filter((p) => p.kind === 'junction' || kinds.includes(p.kind));
  const ids = new Set(parts.map((p) => p.id));
  return { parts, wires: clip.wires.filter((w) => ids.has(w.a.part) && ids.has(w.b.part)) };
}

/** The middle of a clip's parts, on the grid. */
function clipCentre(clip: Clip): Point {
  const boxes = clip.parts.map(partBox);
  const left = Math.min(...boxes.map((b) => b.x));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const top = Math.min(...boxes.map((b) => b.y));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: snap((left + right) / 2), y: snap((top + bottom) / 2) };
}

/** True while the user has text selected on the page (an error message, say), so Ctrl+C copies that instead. */
const textSelected = () => (window.getSelection()?.toString() ?? '') !== '';

/**
 * Creates a session: loads the board saved under `storageKey`, keeps the live
 * circuit in step with it, runs it in real time, saves every change, and
 * handles the board's keyboard shortcuts.
 */
export function useSessionState(storageKey: string, parts: readonly PartKind[]): Session {
  const history = useHistory(() => loadBoard(storageKey) ?? EMPTY_BOARD);
  const board = history.present;
  // An ESP32's program runs in a worker, so a loop that never ends can be stopped instead of freezing the page.
  const [sim] = useState(() => new BoardSim(() => new WorkerTransport()));
  const [picked, select] = useState<Selection>(NOTHING);
  const selection = prune(board, picked); // undo can take selected things away
  const [ghost, setGhost] = useState<Session['ghost']>(undefined);
  const [canPaste, setCanPaste] = useState(clipboard !== undefined);
  const [meter, setMeter] = useState<MeterState>(METER_START);
  const [guessFirst, setGuessFirst] = useState(storedGuessFirst);
  const [guesses, setGuesses] = useState<Session['guesses']>({});
  const [holds, setHolds] = useState<ReadonlySet<string>>(new Set());
  // A held button that's left the board (deleted, or undone away) is let go: if it comes back, it comes back up.
  const strayHolds = [...holds].filter((id) => !board.parts.some((p) => p.id === id));
  if (strayHolds.length > 0) setHolds(new Set([...holds].filter((id) => !strayHolds.includes(id))));
  const canvas = useRef<CanvasApi>(null);

  // The circuit follows the board, and the board is saved as it changes.
  useEffect(() => {
    sim.sync(board);
    saveBoard(storageKey, board);
  }, [sim, board, storageKey]);

  // Real time: one step per animation frame, whichever windows are showing.
  useEffect(() => {
    let request = 0;
    let last: number | undefined;
    const tick = (now: number) => {
      const dt = last === undefined ? 0 : Math.min((now - last) / 1000, MAX_DT);
      last = now;
      sim.step(dt);
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(request);
    };
  }, [sim]);

  const place = (kind: PartKind, at: Point) => {
    const added = addPart(board, kind, snap(at.x), snap(at.y), CATALOG[kind].defaults);
    history.commit(() => added.board);
    select({ parts: [added.id], wires: [] });
  };

  const remove = () => {
    if (isEmpty(selection)) return;
    history.commit((b) => removeItems(b, selection.parts, selection.wires));
    select(NOTHING);
  };

  const rotate = (ids: readonly string[] = selection.parts) => {
    history.commit((b) => rotateParts(b, ids));
  };

  const nudge = (step: Point) => {
    history.commit((b) => moveParts(b, selection.parts, step.x, step.y), `nudge:${selection.parts.join(',')}`);
  };

  /** Pastes `clip` shifted by (dx, dy), and selects the copy. */
  const pasteAt = (clip: Clip, dx: number, dy: number) => {
    const usable = allowedClip(clip, parts);
    if (usable.parts.length === 0) return;
    const pasted = pasteClip(board, usable, dx, dy);
    history.commit(() => pasted.board);
    select({ parts: pasted.parts, wires: pasted.wires });
  };

  const copy = () => {
    if (selection.parts.length === 0) return;
    clipboard = { clip: copyParts(board, selection.parts), pastes: 0 };
    setCanPaste(true);
  };

  const paste = (at?: Point) => {
    if (!clipboard) return;
    const usable = allowedClip(clipboard.clip, parts);
    if (usable.parts.length === 0) return;
    if (at) {
      const centre = clipCentre(usable);
      pasteAt(usable, snap(at.x) - centre.x, snap(at.y) - centre.y);
      return;
    }
    clipboard.pastes += 1;
    pasteAt(usable, clipboard.pastes * COPY_OFFSET, clipboard.pastes * COPY_OFFSET);
  };

  const duplicate = () => {
    if (selection.parts.length === 0) return;
    pasteAt(copyParts(board, selection.parts), COPY_OFFSET, COPY_OFFSET);
  };

  const selectAll = () => {
    select(all(board));
  };

  // Shortcuts for the board, wherever focus is (except while typing, or inside a menu).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const key = event.key.toLowerCase();
      if (target instanceof HTMLTextAreaElement) return;
      if (target instanceof HTMLInputElement && (target.type !== 'range' || key.startsWith('arrow'))) return;
      if (target instanceof HTMLElement && target.closest('[role="separator"], [role="menu"], .dv-tabs-container')) return;

      if (event.ctrlKey || event.metaKey) {
        if (key === 'z' && !event.shiftKey) history.undo();
        else if ((key === 'z' && event.shiftKey) || key === 'y') history.redo();
        else if (key === 'a') selectAll();
        else if (key === 'c' && !textSelected()) copy();
        else if (key === 'v') paste();
        else if (key === 'd') duplicate();
        else return;
        event.preventDefault();
        return;
      }
      if (event.altKey) return;

      const arrow = ARROWS[key];
      if (key === 'v') setMeter((m) => ({ ...m, mode: 'volts' }));
      else if (key === 'a') setMeter((m) => ({ ...m, mode: 'amps' }));
      else if (key === 'r' && selection.parts.length > 0) rotate();
      else if ((key === 'delete' || key === 'backspace') && !isEmpty(selection)) remove();
      else if (key === 'escape' && !isEmpty(selection)) select(NOTHING);
      else if (arrow && selection.parts.length > 0) nudge(arrow);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  });

  return {
    board,
    sim,
    parts,
    selection,
    select,
    ghost,
    canvas,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undo: history.undo,
    redo: history.redo,

    carry: (kind, clientX, clientY) => {
      const at = canvas.current?.toBoard(clientX, clientY);
      setGhost(at ? { kind, at: { x: snap(at.x), y: snap(at.y) } } : undefined);
    },
    drop: (kind, clientX, clientY, dragged) => {
      setGhost(undefined);
      if (dragged) {
        const at = canvas.current?.toBoard(clientX, clientY);
        if (at) place(kind, at);
      } else {
        place(kind, freeSpot(board, kind, canvas.current?.centre() ?? { x: 0, y: 0 }));
      }
    },
    cancelCarry: () => {
      setGhost(undefined);
    },
    addPart: (kind, at) => {
      if (parts.includes(kind)) place(kind, at);
    },

    moveParts: (ids, dx, dy) => {
      history.commit((b) => moveParts(b, ids, dx, dy));
    },
    connect: (a, b) => {
      const result = connect(board, a, b);
      history.commit(() => result.board);
      // A lead on a wire that was just cut stays where it was, on whichever half that now is.
      if (result.splits.length > 0) {
        setMeter((m) => {
          const leads: Partial<Record<Tool, ProbeTarget>> = {};
          for (const tool of TOOLS) {
            const target = m.leads[tool];
            if (target) leads[tool] = afterSplits(target, result.splits);
          }
          return { ...m, leads };
        });
      }
    },
    rotate,
    setProp: (id, key, value) => {
      history.commit((b) => setProp(b, id, key, value), `prop:${id}:${key}`);
    },
    remove,
    duplicate,
    copy,
    canPaste,
    paste,
    selectAll,
    replace: (id) => {
      sim.replace(id);
    },
    flip: (id) => {
      history.commit((b) => {
        const side = b.parts.find((p) => p.id === id)?.props.side;
        return side === undefined ? b : setProp(b, id, 'side', side === 'b' ? 'a' : 'b');
      });
    },
    press: (id, down) => {
      sim.press(id, down || holds.has(id)); // letting go of one that's held from the menu leaves it held
    },
    holds,
    setHold: (id, held) => {
      const next = new Set(holds);
      if (held) next.add(id);
      else next.delete(id);
      setHolds(next);
      sim.press(id, held);
    },
    clear: () => {
      history.commit(() => EMPTY_BOARD);
      select(NOTHING);
    },

    meter,
    setMeterMode: (mode) => {
      setMeter((m) => ({ ...m, mode }));
    },
    placeLead: (tool, target) => {
      setMeter((m) => ({ ...m, leads: { ...m.leads, [tool]: target } }));
    },
    stowLeads: () => {
      setMeter((m) => ({ ...m, leads: {} }));
    },
    guessFirst,
    setGuessFirst: (on) => {
      setGuessFirst(on);
      try {
        window.localStorage.setItem(GUESS_KEY, on ? 'on' : 'off');
      } catch {
        // Private windows can refuse storage; the setting just won't stick.
      }
    },
    guesses,
    reveal: (key, record) => {
      setGuesses((current) => ({ ...current, [key]: record }));
    },
    forget: (key) => {
      setGuesses((current) => Object.fromEntries(Object.entries(current).filter(([k]) => k !== key)));
    },
  };
}
