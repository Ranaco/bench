import { useRef, useState, type KeyboardEvent } from 'react';

/**
 * A game-style menu: one item is always highlighted, the arrow keys move the
 * highlight (and focus) up and down, the pointer moves it on hover, and Enter
 * picks it. Highlight moves are instant, never animated: they happen too often.
 */
export function useRoving(count: number) {
  const [active, setActive] = useState(0);
  const items = useRef<(HTMLElement | null)[]>([]);

  const moveTo = (index: number) => {
    const next = (index + count) % count;
    setActive(next);
    items.current[next]?.focus();
  };

  return {
    active,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') moveTo(active + 1);
      else if (event.key === 'ArrowUp') moveTo(active - 1);
      else if (event.key === 'Home') moveTo(0);
      else if (event.key === 'End') moveTo(count - 1);
      else return;
      event.preventDefault();
    },
    /** Spread onto item `index`. */
    item: (index: number) => ({
      ref: (element: HTMLElement | null) => {
        items.current[index] = element;
      },
      'data-active': index === active,
      onPointerEnter: () => {
        setActive(index);
      },
      onFocus: () => {
        setActive(index);
      },
    }),
  };
}
