import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';

/** A rectangle in drawing units. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Where the camera looks: a centre in drawing units, and screen pixels per drawing unit. */
interface View {
  readonly cx: number;
  readonly cy: number;
  readonly zoom: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * The view being dragged: by one pointer (a pan), or two fingers (a pinch,
 * which zooms and pans at once). `starts` is where each one was, in screen
 * pixels, when the drag (re)started from `from`.
 */
interface Drag {
  readonly starts: ReadonlyMap<number, Point>;
  readonly from: View;
}

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Room left around whatever is framed, in pixels. */
const MARGIN = 32;
/** Zoom buttons and framing glide for this long; the wheel and dragging stay instant. */
const GLIDE_MS = 240;
/** 1 is actual size: one drawing unit to one pixel. */
const ZOOM_RANGE = { min: 0.2, max: 6 };
/** Framing never zooms in past actual size: a small circuit stays its real size, in the middle. */
const FRAME_MAX_ZOOM = 1;
const HOME: View = { cx: 0, cy: 0, zoom: 1 };

const clampZoom = (zoom: number) => Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, zoom));

/** The view that shows all of `box` in a `width` × `height` pixel area. */
function frame(width: number, height: number, box: Box): View {
  const zoom = Math.min((width - 2 * MARGIN) / box.width, (height - 2 * MARGIN) / box.height, FRAME_MAX_ZOOM);
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2, zoom: clampZoom(zoom) };
}

/**
 * Zoom and pan for an SVG drawing, the way a design tool does it: the scale
 * stays put when the window is resized (you just see more or less), the wheel
 * zooms around the pointer, beginPan() drags the view, and show() frames a box. It opens framed on `opening`, or at actual size around (0, 0).
 */
export function useCamera(container: RefObject<HTMLDivElement | null>, opening: Box | undefined) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View | undefined>(undefined); // undefined until the canvas has a size
  const [drag, setDrag] = useState<Drag | undefined>(undefined);
  /** Where each dragging pointer is now, in screen pixels: kept between moves, not rendered. */
  const pointers = useRef(new Map<number, Point>());
  const shown = view ?? HOME;

  const viewBox: Box = {
    x: shown.cx - size.width / 2 / shown.zoom,
    y: shown.cy - size.height / 2 / shown.zoom,
    width: Math.max(size.width, 1) / shown.zoom,
    height: Math.max(size.height, 1) / shown.zoom,
  };

  /** Zooms by `factor`, keeping the drawing point under (px, py) on screen where it is. */
  const zoomAt = (from: View, factor: number, px: number, py: number): View => {
    const zoom = clampZoom(from.zoom * factor);
    const point = {
      x: from.cx + (px - size.width / 2) / from.zoom,
      y: from.cy + (py - size.height / 2) / from.zoom,
    };
    const keep = from.zoom / zoom;
    return { cx: point.x + (from.cx - point.x) * keep, cy: point.y + (from.cy - point.y) * keep, zoom };
  };

  // Buttons and framing glide; anything continuous (wheel, drag) cancels the glide and takes over.
  const glide = useRef(0);
  const glideTo = (target: View) => {
    cancelAnimationFrame(glide.current);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setView(target);
      return;
    }
    const start = shown;
    const began = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / GLIDE_MS);
      const eased = 1 - (1 - t) ** 3;
      setView({
        cx: start.cx + (target.cx - start.cx) * eased,
        cy: start.cy + (target.cy - start.cy) * eased,
        // Zoom glides evenly in ratio, so zooming out feels as smooth as zooming in.
        zoom: start.zoom * (target.zoom / start.zoom) ** eased,
      });
      if (t < 1) glide.current = requestAnimationFrame(step);
    };
    glide.current = requestAnimationFrame(step);
  };

  // The latest values for the native listeners below.
  const latest = useRef({ shown, zoomAt, opening });
  useEffect(() => {
    latest.current = { shown, zoomAt, opening };
  });

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
      // The first time the canvas has a size, open on the parts. After that, resizing keeps the scale.
      if (width > 0 && height > 0) {
        setView((current) => {
          if (current) return current;
          const box = latest.current.opening;
          return box ? frame(width, height, box) : HOME;
        });
      }
    });
    observer.observe(element);

    // Attached by hand: React's wheel listeners are passive, and pinch-zoom (ctrl + wheel)
    // must be stopped from zooming the whole page.
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      cancelAnimationFrame(glide.current);
      const rect = element.getBoundingClientRect();
      const lines = event.deltaMode === 1 ? 16 : 1;
      const factor = Math.exp(-event.deltaY * lines * (event.ctrlKey ? 0.01 : 0.0015));
      const { shown: from, zoomAt: zoom } = latest.current;
      setView(zoom(from, factor, event.clientX - rect.left, event.clientY - rect.top));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener('wheel', wheel);
    };
  }, [container]);

  return {
    viewBox,
    /** Screen pixels per drawing unit. */
    scale: shown.zoom,
    panning: drag !== undefined,
    zoomPercent: Math.round(shown.zoom * 100),

    /**
     * Drags the view with this press: the caller decides which presses pan. A
     * second finger joins the first, and the two pinch: spread them to zoom in
     * around the point between them, move them together to pan.
     */
    beginPan: (event: PointerEvent<SVGSVGElement>) => {
      if (pointers.current.size >= 2 || pointers.current.has(event.pointerId)) return;
      event.preventDefault();
      cancelAnimationFrame(glide.current);
      event.currentTarget.setPointerCapture(event.pointerId);
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      setDrag({ starts: new Map(pointers.current), from: shown });
    },
    /**
     * Hands the camera a finger that was already down doing something else (moving
     * a part, say), where it is now, so a second finger landing can pinch with it.
     */
    adopt: (pointer: number, clientX: number, clientY: number) => {
      if (pointers.current.size >= 2) return;
      pointers.current.set(pointer, { x: clientX, y: clientY });
      setDrag({ starts: new Map(pointers.current), from: shown });
    },
    /** True while this pointer is dragging the view. */
    has: (pointer: number) => pointers.current.has(pointer),
    onPointerMove: (event: PointerEvent<SVGSVGElement>) => {
      if (!drag || !pointers.current.has(event.pointerId)) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const { from, starts } = drag;
      const ids = [...starts.keys()];
      const [first, second] = ids;
      const start = (id: number) => starts.get(id) ?? { x: 0, y: 0 };
      const now = (id: number) => pointers.current.get(id) ?? start(id);
      if (ids.length === 1) {
        setView({ ...from, cx: from.cx - (now(first).x - start(first).x) / from.zoom, cy: from.cy - (now(first).y - start(first).y) / from.zoom });
        return;
      }
      // Two fingers: the drawing point that was between them stays between them, scaled by how far they've spread.
      const rect = container.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
      const was = midpoint(start(first), start(second));
      const is = midpoint(now(first), now(second));
      const apart = distance(start(first), start(second));
      const zoom = clampZoom(from.zoom * (apart > 0 ? distance(now(first), now(second)) / apart : 1));
      const held = {
        x: from.cx + (was.x - rect.left - size.width / 2) / from.zoom,
        y: from.cy + (was.y - rect.top - size.height / 2) / from.zoom,
      };
      setView({ cx: held.x - (is.x - rect.left - size.width / 2) / zoom, cy: held.y - (is.y - rect.top - size.height / 2) / zoom, zoom });
    },
    onPointerUp: (event: PointerEvent<SVGSVGElement>) => {
      if (!pointers.current.delete(event.pointerId)) return;
      // One finger lifted from a pinch: the other carries on panning from here.
      setDrag(pointers.current.size > 0 ? { starts: new Map(pointers.current), from: shown } : undefined);
    },

    zoomIn: () => {
      glideTo(zoomAt(shown, 1.25, size.width / 2, size.height / 2));
    },
    zoomOut: () => {
      glideTo(zoomAt(shown, 1 / 1.25, size.width / 2, size.height / 2));
    },
    /** Back to 100%, around the middle of the view. */
    actualSize: () => {
      glideTo({ ...shown, zoom: 1 });
    },
    /** Glides to frame `box`, or back to actual size around (0, 0) when there's nothing to frame. */
    show: (box: Box | undefined) => {
      glideTo(box && size.width > 0 ? frame(size.width, size.height, box) : HOME);
    },
  };
}
