import { invalidate } from '@react-three/fiber';
import { useEffect, useRef } from 'react';

const prefersStill = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Eases a value towards `target` over `ms`, calling `apply` each frame and
 * asking the 3D view to redraw; at once for people who'd rather not see things
 * move (docs/3d.md §6). Returns the value as it stands, for reading in handlers.
 */
export function useTween(target: number, ms: number, apply: (value: number) => void) {
  const value = useRef(target);
  const latest = useRef(apply);
  useEffect(() => {
    latest.current = apply;
  });
  useEffect(() => {
    const start = value.current;
    if (start === target) {
      latest.current(target);
      invalidate();
      return;
    }
    const still = prefersStill();
    const began = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = still ? 1 : Math.min(1, (now - began) / ms);
      value.current = start + (target - start) * (1 - (1 - t) ** 3);
      latest.current(value.current);
      invalidate();
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [target, ms]);
  return value;
}

export const reducedMotion = prefersStill;
