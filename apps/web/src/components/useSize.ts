import { useEffect, useRef, useState } from 'react';

/** The size of an element in pixels, kept up to date as it's resized: for graphs that draw to fit their window. */
export function useSize() {
  const element = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const target = element.current;
    if (!target) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) });
    });
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [element, size] as const;
}
