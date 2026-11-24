/**
 * What the Code window should show when something opens it: an ESP32's program ("Edit program"), or a part's source
 * ("Edit source"), at one module when it matters which (the lesson's own part). Kept outside the window, which loads
 * only when it's first shown, so the ask is there when it arrives.
 */
import { useSyncExternalStore } from 'react';
import type { ModuleId } from '@bench/engine';

export type CodeView = { readonly view: 'program' } | { readonly view: 'source'; readonly module?: ModuleId };

/** The latest ask, numbered so asking for the same thing twice still counts. */
export type Asked = CodeView & { readonly n: number };

let asked: Asked | undefined;
const listeners = new Set<() => void>();

/** Asks the Code window to show `what`. */
export function askFor(what: CodeView): void {
  asked = { ...what, n: (asked?.n ?? 0) + 1 };
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The latest ask, if anything has asked. */
export const useAsked = (): Asked | undefined => useSyncExternalStore(subscribe, () => asked);
