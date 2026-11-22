import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export type MenuEntry =
  | {
      readonly label: string;
      /** Shown on the right, so the menu teaches the shortcut. */
      readonly shortcut?: string;
      readonly onSelect: () => void;
      readonly disabled?: boolean;
      /** Destructive, like Delete: shown in red. */
      readonly danger?: boolean;
    }
  | { readonly heading: string }
  | { readonly note: string }
  | 'separator';

interface ContextMenuProps {
  /** Where it opens, in screen pixels: the pointer. */
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly entries: readonly MenuEntry[];
  readonly onClose: () => void;
}

/** Gap kept between the menu and the window's edges, in pixels. */
const EDGE = 8;

/**
 * A right-click menu at the pointer. It opens towards the room there is, takes
 * keyboard focus (arrows move, Enter picks, Esc closes), and closes on a click
 * anywhere else, a scroll or a resize.
 */
export function ContextMenu({ x, y, label, entries, onClose }: ContextMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  const before = useRef<Element | null>(null);

  // Opens down and right from the pointer, or flips to stay on screen; then takes focus.
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    before.current = document.activeElement;
    const { width, height } = element.getBoundingClientRect();
    const flipX = x + width > window.innerWidth - EDGE;
    const flipY = y + height > window.innerHeight - EDGE;
    element.style.left = `${String(flipX ? Math.max(EDGE, x - width) : x)}px`;
    element.style.top = `${String(flipY ? Math.max(EDGE, y - height) : y)}px`;
    element.style.transformOrigin = `${flipY ? 'bottom' : 'top'} ${flipX ? 'right' : 'left'}`;
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [x, y]);

  useEffect(() => {
    const away = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !menu.current?.contains(event.target)) onClose();
    };
    const close = () => {
      onClose();
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    window.addEventListener('wheel', close, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('wheel', close);
    };
  }, [onClose]);

  const dismiss = () => {
    onClose();
    if (before.current instanceof HTMLElement) before.current.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const at = items.findIndex((item) => item === document.activeElement);
    const go = (index: number) => {
      items.at((index + items.length) % items.length)?.focus();
    };
    if (event.key === 'ArrowDown') go(at + 1);
    else if (event.key === 'ArrowUp') go(at - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(items.length - 1);
    else if (event.key === 'Escape' || event.key === 'Tab') dismiss();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return createPortal(
    <div
      ref={menu}
      className="menu context-menu"
      role="menu"
      aria-label={label}
      style={{ left: x, top: y }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
    >
      {entries.map((entry, i) => {
        if (entry === 'separator') return <div key={i} className="menu-separator" role="separator" />;
        if ('heading' in entry) {
          return (
            <p key={i} className="menu-heading" role="presentation">
              {entry.heading}
            </p>
          );
        }
        if ('note' in entry) {
          return (
            <p key={i} className="menu-note" role="presentation">
              {entry.note}
            </p>
          );
        }
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={entry.danger ? 'danger' : undefined}
            disabled={entry.disabled}
            onClick={() => {
              entry.onSelect();
              dismiss();
            }}
          >
            <span>{entry.label}</span>
            {entry.shortcut && <kbd>{entry.shortcut}</kbd>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
