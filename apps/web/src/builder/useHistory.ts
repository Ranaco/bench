import { useState } from 'react';

/** How many steps back undo can go. */
const DEPTH = 200;

interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
  /** What the last change was, so a run of the same change (a slider drag) undoes in one step. */
  readonly lastKey: string | undefined;
}

/**
 * Undo and redo over plain values. Every change is a new value, so going back
 * is just showing an older one.
 */
export function useHistory<T>(initial: () => T) {
  const [history, setHistory] = useState<History<T>>(() => ({
    past: [],
    present: initial(),
    future: [],
    lastKey: undefined,
  }));

  return {
    present: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,

    /**
     * Makes a change. Changes with the same `key` in a row merge into one
     * undo step; leave it out for a change that always stands alone.
     */
    commit: (change: (current: T) => T, key?: string) => {
      setHistory((h) => {
        const next = change(h.present);
        if (Object.is(next, h.present)) return h;
        if (key !== undefined && key === h.lastKey) return { ...h, present: next, future: [] };
        return { past: [...h.past, h.present].slice(-DEPTH), present: next, future: [], lastKey: key };
      });
    },

    undo: () => {
      setHistory((h) => {
        const previous = h.past.at(-1);
        if (previous === undefined) return h;
        return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future], lastKey: undefined };
      });
    },

    redo: () => {
      setHistory((h) => {
        const [next, ...rest] = h.future;
        if (h.future.length === 0) return h;
        return { past: [...h.past, h.present], present: next, future: rest, lastKey: undefined };
      });
    },
  };
}
