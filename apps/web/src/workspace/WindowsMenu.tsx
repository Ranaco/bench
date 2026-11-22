import type { DockviewApi } from 'dockview-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { defaultLayout, openWindow, WINDOW_TITLES, WINDOWS, type Mode } from './layout';

/** Which windows are open right now, kept in step with the dock. */
function useOpenWindows(api: DockviewApi): ReadonlySet<string> {
  const ids = useSyncExternalStore(
    (changed) => {
      const added = api.onDidAddPanel(changed);
      const removed = api.onDidRemovePanel(changed);
      return () => {
        added.dispose();
        removed.dispose();
      };
    },
    () =>
      api.panels
        .map((p) => p.id)
        .sort()
        .join(' '),
  );
  return new Set(ids.split(' '));
}

/** Opens and closes windows, and puts everything back where it started. */
export function WindowsMenu({ api, mode }: { readonly api: DockviewApi; readonly mode: Mode }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const openWindows = useOpenWindows(api);

  // Click anywhere else, or press Esc, and it closes.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (event.target instanceof Node && !anchor.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className="menu-anchor" ref={anchor}>
      <button
        type="button"
        className="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        Windows
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Windows">
          {WINDOWS[mode].map((id) => {
            const shown = openWindows.has(id);
            return (
              <button
                key={id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={shown}
                onClick={() => {
                  const panel = api.getPanel(id);
                  if (panel) api.removePanel(panel);
                  else openWindow(api, id);
                }}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  {shown && <path d="M4 8.5l2.5 2.5L12 5.5" />}
                </svg>
                {WINDOW_TITLES[id]}
              </button>
            );
          })}
          <div className="menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              defaultLayout(api, mode);
              setOpen(false);
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" />
            Reset layout
          </button>
        </div>
      )}
    </div>
  );
}
