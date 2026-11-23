import { RED_LED } from '@bench/engine';
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { Burst, ReplaceButton } from './marks';
import { useCamera } from '../components/useCamera';
import { flowSpeed, ledGlow } from '../flow';
import { formatSI } from '../format';
import type { Point } from '../geometry';
import { moveParts, samePin, type Board, type Landing, type PartKind, type PinRef, type PlacedPart } from './board';
import { capacitorSpec, CATALOG, GRID, KNOB_DIAL as DIAL, pinAt, snap, supplyFor, turnOf } from './catalog';
import { liveTarget, measure, type MeterState, type ProbeTarget, type Tool } from './meter';
import {
  boardBounds,
  boxBetween,
  inBox,
  labelSpot,
  nearestOnRoute,
  partBox,
  pinFacing,
  pinNear,
  pinsOf,
  pointAlong,
  roundedPath,
  routeBetween,
  tapPoint,
  wireRoute,
} from './route';
import { includes, NOTHING, only, size, toggle, union, type Selection } from './selection';
import { pinKey, type BoardSim, type BoardSnapshot, type PartReading } from './sync';
import { ButtonCap, KnobDial, KnobWiper, LedLight, PartSymbol, SwitchLever } from './symbols';

/** What the page needs from the canvas: dropping parts carried in from the palette, and the view. */
export interface CanvasApi {
  /** The board point under a screen point, or undefined when it's outside the canvas. */
  toBoard(clientX: number, clientY: number): Point | undefined;
  /** The board point in the middle of the view. */
  centre(): Point;
  /** Frames every part. */
  fit(): void;
  /** Back to 100%: one drawing unit to one pixel. */
  actualSize(): void;
}

/** What a right-click landed on. */
export type MenuTarget = { readonly kind: 'part' | 'wire'; readonly id: string } | { readonly kind: 'board' };

interface BoardCanvasProps {
  readonly ref: Ref<CanvasApi>;
  readonly board: Board;
  readonly sim: BoardSim;
  readonly selection: Selection;
  readonly onSelect: (selection: Selection) => void;
  /** Moves a group of parts, once, when a drag ends. */
  readonly onMove: (ids: readonly string[], dx: number, dy: number) => void;
  /** A new wire between two landings: pins, or points along wires (which get a junction). */
  readonly onConnect: (a: Landing, b: Landing) => void;
  readonly onReplace: (id: string) => void;
  /** A click on a slide switch's lever. */
  readonly onFlip: (id: string) => void;
  /** A push button's cap pressed down (true) or let go (false). */
  readonly onPress: (id: string, down: boolean) => void;
  /** Turns a knob to `turn`, 0 to 1. A whole drag is one undo step. */
  readonly onTurn: (id: string, turn: number) => void;
  /** A right-click: what it landed on, where on screen, and where on the board. */
  readonly onMenu: (target: MenuTarget, clientX: number, clientY: number, at: Point) => void;
  /** A part being carried in from the palette. */
  readonly ghost: { readonly kind: PartKind; readonly at: Point } | undefined;
  /** The multimeter's leads, drawn on the board and dragged from their sockets at its bottom-left. */
  readonly meter: MeterState;
  readonly onLead: (tool: Tool, target: ProbeTarget | undefined) => void;
  /** True while a reading should stay hidden until it's been guessed. */
  readonly hideReading: (key: string) => boolean;
  /** Cards and hints that float over the canvas. */
  readonly children?: ReactNode;
}

type Gesture =
  | {
      readonly type: 'move';
      /** Everything moving: the whole selection when the pressed part is in it. */
      readonly ids: readonly string[];
      readonly pressed: string;
      readonly pointer: number;
      readonly start: Point;
      /** How far it's moved, in whole grid steps. */
      readonly delta: Point;
      readonly moved: boolean;
      /** A press on part of a bigger selection that ends up not moving selects just that part. */
      readonly collapse: boolean;
      /** Pressed on a slide switch's lever: a click (no drag) flips it. */
      readonly flip: boolean;
    }
  | {
      readonly type: 'wire';
      /** A pin, or a point along a wire it was pulled out of. */
      readonly from: Landing;
      /** Undefined once the button is up: the wire follows the pointer until a second click. */
      readonly pointer: number | undefined;
      readonly start: Point;
      readonly at: Point;
      readonly target: Landing | undefined;
      readonly moved: boolean;
    }
  | {
      /** A meter lead being dragged: `at` is its tip, `target` what it would touch if let go now. */
      readonly type: 'lead';
      readonly tool: Tool;
      readonly pointer: number;
      readonly offset: Point;
      readonly at: Point;
      readonly target: ProbeTarget | undefined;
    }
  | {
      /** A press on a wire: a click selects it, a drag pulls a new wire out of it. */
      readonly type: 'press-wire';
      readonly wire: string;
      readonly pointer: number;
      readonly start: Point;
    }
  | {
      /** A knob's dial being turned: dragging up or right turns it clockwise, towards pin 3. */
      readonly type: 'turn';
      readonly part: string;
      readonly pointer: number;
      /** Where the press was, in screen pixels, so it turns the same at any zoom. */
      readonly startX: number;
      readonly startY: number;
      readonly from: number;
    }
  | {
      /** A selection box, dragged out on empty board. */
      readonly type: 'box';
      readonly pointer: number;
      readonly start: Point;
      readonly at: Point;
      /** What stays selected underneath: the old selection with Shift or Ctrl held, nothing without. */
      readonly base: Selection;
      readonly moved: boolean;
    };

/**
 * What dragging empty board does. 'select' draws a selection box, and the view
 * pans with a right-drag, Space+drag or the middle button; 'pan' moves the view.
 */
const EMPTY_DRAG = 'select' as 'select' | 'pan';

const DOT_SPACING = 18;
/** How far, in screen pixels, a press can wander before it counts as a drag. */
const DRAG_SLOP = 4;
/** How close, in screen pixels, a wire end has to come to a pin to land on it… */
const PIN_REACH = 18;
/** …or to a wire to tap into it. */
const WIRE_REACH = 10;
/** How close, in screen pixels, a meter lead has to come to a pin or wire to touch it. */
const LEAD_REACH = 24;
/** The meter's sockets sit in the board's bottom-left corner, in screen pixels, whatever the zoom. */
const JACK_X: Readonly<Record<Tool, number>> = { red: 28, black: 68, clamp: 28 };
const TOOL_LABEL: Readonly<Record<Tool, string>> = { red: 'V', black: 'COM', clamp: 'A' };
const LINE_HEIGHT = 16;
/** The Replace pill's size, as drawn by ReplaceButton. */
const PILL_WIDTH = 76;
const PILL_HEIGHT = 26;

function parsePin(key: string | null): PinRef | undefined {
  if (!key) return undefined;
  const dot = key.indexOf('.');
  return dot === -1 ? undefined : { part: key.slice(0, dot), pin: key.slice(dot + 1) };
}

/** How far a drag on a knob's dial goes, in screen pixels, to turn it from one end to the other. */
const TURN_PIXELS = 200;

/** What's written beside a part: its name, then its value. */
function labelLines(part: PlacedPart): string[] {
  switch (part.kind) {
    case 'battery':
      return [part.label, supplyFor(part.props.supply).label];
    case 'resistor':
      return [part.label, formatSI(Number(part.props.ohms), 'Ω', { trim: true })];
    case 'knob':
      return [part.label, '10 kΩ'];
    case 'capacitor':
      // Rounded: 0.0022 F × 1e6 is 2199.9999999999995 in floating point.
      return [part.label, `${String(Math.round(capacitorSpec(part.props).farads * 1e6))} µF`];
    case 'transistor':
      return [part.label, 'PN2222A'];
    case 'led':
    case 'switch':
    case 'button':
      return [part.label];
    case 'ground':
    case 'junction':
      return []; // the symbol says it all
  }
}

/**
 * One more line for a part's label, for live notes like its temperature: below
 * the label, or above it when the label sits above the part.
 */
function extraLine(part: PlacedPart, count: number): Point {
  return labelSpot(part).stack === 'up' ? lineAt(part, -1, count) : lineAt(part, count, count);
}

/** The baseline of line `index` of `count` in a part's label. */
function lineAt(part: PlacedPart, index: number, count: number): Point {
  const spot = labelSpot(part);
  const first =
    spot.stack === 'up'
      ? spot.at.y - (count - 1) * LINE_HEIGHT
      : spot.stack === 'down'
        ? spot.at.y + 12
        : spot.at.y + 4 - ((count - 1) * LINE_HEIGHT) / 2;
  return { x: spot.at.x, y: first + index * LINE_HEIGHT };
}

type Status = 'ok' | 'over' | 'burnt' | 'unwritten';

function statusOf(reading: PartReading | undefined): Status {
  if (!reading) return 'ok';
  if (reading.burnt) return 'burnt';
  if (!reading.written) return 'unwritten';
  return reading.over ? 'over' : 'ok';
}

const placeAt = (part: PlacedPart) => `translate(${String(part.x)} ${String(part.y)}) rotate(${String(part.rotation)})`;

/** Typing somewhere: Space belongs to the text box, not to panning. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);

export function BoardCanvas({ ref, ...props }: BoardCanvasProps) {
  const { board, sim, selection, ghost } = props;
  const svg = useRef<SVGSVGElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  // Opens framed on the parts already there; after that the view is yours.
  const [opening] = useState(() => boardBounds(board));
  const camera = useCamera(canvas, opening);
  const [gesture, setGesture] = useState<Gesture | undefined>(undefined);
  const [hoverPin, setHoverPin] = useState<PinRef | undefined>(undefined);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const hovering = useRef(false);
  /** A right-button press: a drag pans, a click opens the menu. */
  const rightPress = useRef<{ x: number; y: number; moved: boolean } | undefined>(undefined);
  /** Push buttons held down, by the pointer holding each: two fingers can hold two buttons. */
  const holding = useRef(new Map<number, string>());
  /** Every finger on the board and where it is now, so a second finger can pinch with the first. */
  const fingers = useRef(new Map<number, Point>());
  /** A finger put down on empty board: if it lifts without moving, it was a tap, which clears the selection. */
  const emptyTap = useRef<{ pointer: number; x: number; y: number } | undefined>(undefined);
  const box = camera.viewBox;
  const scale = camera.scale;

  // While parts are dragged they're drawn where they'd land; the board itself changes once, on release.
  const shown = gesture?.type === 'move' && gesture.moved ? moveParts(board, gesture.ids, gesture.delta.x, gesture.delta.y) : board;
  // Cheap to work out, and the canvas only re-renders on gestures: the live layers handle every frame.
  const parts = new Map(shown.parts.map((p) => [p.id, p]));
  const routes = shown.wires.flatMap((wire) => {
    const points = wireRoute(parts, wire);
    return points ? [{ wire, id: wire.id, points, d: roundedPath(points) }] : [];
  });
  const connected = new Set(shown.wires.flatMap((w) => [pinKey(w.a), pinKey(w.b)]));

  const toDrawing = (event: { clientX: number; clientY: number }): Point => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  };

  useImperativeHandle(ref, () => ({
    toBoard: (clientX, clientY) => {
      const rect = canvas.current?.getBoundingClientRect();
      if (!rect || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return undefined;
      return toDrawing({ clientX, clientY });
    },
    centre: () => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 }),
    fit: () => {
      camera.show(boardBounds(board));
    },
    actualSize: camera.actualSize,
  }));

  // Esc drops a wire being drawn.
  useEffect(() => {
    if (gesture?.type !== 'wire') return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setGesture(undefined);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [gesture?.type]);

  // Hold Space over the board to pan with the left button, like a design tool.
  useEffect(() => {
    const down = (event: globalThis.KeyboardEvent) => {
      if (event.key !== ' ' || !hovering.current || typing(event.target)) return;
      if (event.target instanceof Element && event.target.closest('[role="menu"]')) return; // Space picks a menu item
      event.preventDefault();
      if (!event.repeat) setSpaceHeld(true);
    };
    const up = (event: globalThis.KeyboardEvent) => {
      if (event.key === ' ') setSpaceHeld(false);
    };
    const away = () => {
      setSpaceHeld(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', away);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', away);
    };
  }, []);

  /**
   * Where a wire end dropped at `point` would land: a pin within reach (pins win,
   * so a drop near a wire's end lands on its pin), else a grid point along a wire.
   */
  const landingAt = (point: Point, from: Landing | undefined): Landing | undefined => {
    const pin = pinNear(parts.values(), point, PIN_REACH / scale);
    if (pin && !(from && 'pin' in from && samePin(pin, from.pin))) return { pin };
    let best: { wire: string; distance: number } | undefined;
    for (const route of routes) {
      if (from && 'tap' in from && from.tap.wire === route.id) continue;
      const { distance } = nearestOnRoute(route.points, point);
      if (distance <= WIRE_REACH / scale && (!best || distance < best.distance)) best = { wire: route.id, distance };
    }
    const route = best && routes.find((r) => r.id === best.wire);
    const spot = route && tapPoint(route.points, point);
    return route && spot ? { tap: { wire: route.id, ...spot } } : undefined;
  };

  /** Where a lead's tip touches: a pin (not for the clamp, which closes round wires), or a point along a wire. */
  const leadTargetAt = (at: Point, tool: Tool): ProbeTarget | undefined => {
    if (tool !== 'clamp') {
      const pin = pinNear(parts.values(), at, LEAD_REACH / scale);
      if (pin) return { kind: 'pin', pin };
    }
    let best: { wire: string; t: number; distance: number } | undefined;
    for (const route of routes) {
      const near = nearestOnRoute(route.points, at);
      if (near.distance <= LEAD_REACH / scale && (!best || near.distance < best.distance)) best = { wire: route.id, t: near.t, distance: near.distance };
    }
    return best && { kind: 'wire', wire: best.wire, t: best.t };
  };

  const targetPoint = (target: ProbeTarget): Point | undefined => {
    if (target.kind === 'pin') {
      const part = parts.get(target.pin.part);
      return part && pinAt(part, target.pin.pin);
    }
    const route = routes.find((r) => r.id === target.wire);
    return route && pointAlong(route.points, target.t);
  };

  // The meter lives in screen space so it stays in reach at any zoom; its tips touch the board in drawing space.
  const heightPx = box.height * scale;
  const jackY = heightPx - 18;
  const jack = (tool: Tool): Point => ({ x: JACK_X[tool], y: jackY });
  const docked = (tool: Tool): Point => ({ x: box.x + JACK_X[tool] / scale, y: box.y + (jackY - 40) / scale });
  const toScreen = (point: Point): Point => ({ x: (point.x - box.x) * scale, y: (point.y - box.y) * scale });
  const tools: readonly Tool[] = props.meter.mode === 'volts' ? ['black', 'red'] : ['clamp'];
  const placed = (tool: Tool) => {
    const target = liveTarget(board, props.meter.leads[tool]);
    return target && targetPoint(target);
  };
  const tipOf = (tool: Tool): Point => (gesture?.type === 'lead' && gesture.tool === tool ? gesture.at : (placed(tool) ?? docked(tool)));

  const dragged = (start: Point, point: Point) => Math.hypot(point.x - start.x, point.y - start.y) * scale > DRAG_SLOP;

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest('.pill')) return; // the Replace button handles its own click

    // Working on the board: let go of whatever had focus elsewhere (so Space pans rather than pressing that
    // button again) and of any selected text (so Ctrl+C copies parts, not an old bit of a message).
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && !canvas.current?.contains(focused)) focused.blur();
    window.getSelection()?.removeAllRanges();

    // A second finger pinches the view with the first, whatever the first was doing (moving a part, say,
    // which then stays put). Except on a push button's cap: two fingers can hold down two buttons.
    if (event.pointerType === 'touch') {
      fingers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const other = [...fingers.current.keys()].find((id) => id !== event.pointerId && !holding.current.has(id));
      const cap = element?.closest('[data-actuator]')?.getAttribute('data-actuator');
      if (other !== undefined && !(cap && parts.get(cap)?.kind === 'button')) {
        const at = fingers.current.get(other);
        if (!camera.has(other) && at) {
          setGesture(undefined);
          camera.adopt(other, at.x, at.y);
        }
        emptyTap.current = undefined;
        camera.beginPan(event);
        return;
      }
    }

    // A meter lead: picked up from wherever it is.
    const tool = element?.closest('[data-tool]')?.getAttribute('data-tool') as Tool | null | undefined;
    if (tool && event.button === 0) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const pointer = toDrawing(event);
      const tip = tipOf(tool);
      setGesture({
        type: 'lead',
        tool,
        pointer: event.pointerId,
        offset: { x: tip.x - pointer.x, y: tip.y - pointer.y },
        at: tip,
        target: liveTarget(board, props.meter.leads[tool]),
      });
      return;
    }

    // Panning: the middle button, the right button (a click there opens the menu instead), or Space+drag.
    if (event.button === 1 || event.button === 2 || (event.button === 0 && spaceHeld)) {
      rightPress.current = event.button === 2 ? { x: event.clientX, y: event.clientY, moved: false } : undefined;
      camera.beginPan(event);
      return;
    }
    if (event.button !== 0) return;
    const point = toDrawing(event);
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;

    // The second click of a click-click wire: land on a pin or a wire, or let go anywhere else.
    if (gesture?.type === 'wire' && gesture.pointer === undefined) {
      const target = landingAt(point, gesture.from);
      if (target) props.onConnect(gesture.from, target);
      setGesture(undefined);
      return;
    }

    const pin = parsePin(element?.closest('[data-pin]')?.getAttribute('data-pin') ?? null);
    if (pin) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setGesture({ type: 'wire', from: { pin }, pointer: event.pointerId, start: point, at: point, target: undefined, moved: false });
      return;
    }

    // A push button's cap: held down for as long as the pointer is.
    const actuator = element?.closest('[data-actuator]')?.getAttribute('data-actuator');
    // A knob's dial: dragged to turn it.
    const knob = actuator ? parts.get(actuator) : undefined;
    if (actuator && knob?.kind === 'knob' && !additive) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      if (!(includes(selection, 'part', actuator) && size(selection) === 1)) props.onSelect(only('part', actuator));
      setGesture({ type: 'turn', part: actuator, pointer: event.pointerId, startX: event.clientX, startY: event.clientY, from: turnOf(knob.props) });
      return;
    }
    if (actuator && !additive && parts.get(actuator)?.kind === 'button') {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      holding.current.set(event.pointerId, actuator);
      props.onPress(actuator, true);
      return;
    }

    const partId = element?.closest('[data-part]')?.getAttribute('data-part');
    if (partId && parts.has(partId)) {
      event.preventDefault();
      if (additive) {
        props.onSelect(toggle(selection, 'part', partId));
        return;
      }
      const inSelection = includes(selection, 'part', partId);
      if (!inSelection) props.onSelect(only('part', partId));
      event.currentTarget.setPointerCapture(event.pointerId);
      setGesture({
        type: 'move',
        ids: inSelection ? selection.parts : [partId],
        pressed: partId,
        pointer: event.pointerId,
        start: point,
        delta: { x: 0, y: 0 },
        moved: false,
        collapse: inSelection && size(selection) > 1,
        flip: actuator === partId,
      });
      return;
    }

    const wireId = element?.closest('[data-wire]')?.getAttribute('data-wire');
    if (wireId) {
      if (additive) {
        props.onSelect(toggle(selection, 'wire', wireId));
        return;
      }
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setGesture({ type: 'press-wire', wire: wireId, pointer: event.pointerId, start: point });
      return;
    }

    // Empty board. A finger pans the view (and a tap clears the selection); a mouse draws a selection box (or pans).
    if (event.pointerType === 'touch') {
      emptyTap.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
      camera.beginPan(event);
      return;
    }
    if (EMPTY_DRAG === 'pan') {
      if (!additive) props.onSelect(NOTHING);
      camera.beginPan(event);
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setGesture({ type: 'box', pointer: event.pointerId, start: point, at: point, base: additive ? selection : NOTHING, moved: false });
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (fingers.current.has(event.pointerId)) fingers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const press = rightPress.current;
    if (press && !press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_SLOP) {
      rightPress.current = { ...press, moved: true };
    }
    if (gesture?.type === 'lead' && gesture.pointer === event.pointerId) {
      const point = toDrawing(event);
      const at = { x: point.x + gesture.offset.x, y: point.y + gesture.offset.y };
      setGesture({ ...gesture, at, target: leadTargetAt(at, gesture.tool) });
      return;
    }
    if (gesture?.type === 'move' && gesture.pointer === event.pointerId) {
      const point = toDrawing(event);
      const delta = { x: snap(point.x - gesture.start.x), y: snap(point.y - gesture.start.y) };
      setGesture({ ...gesture, delta, moved: gesture.moved || dragged(gesture.start, point) });
      return;
    }
    if (gesture?.type === 'wire' && (gesture.pointer === undefined || gesture.pointer === event.pointerId)) {
      const point = toDrawing(event);
      setGesture({ ...gesture, at: point, target: landingAt(point, gesture.from), moved: gesture.moved || dragged(gesture.start, point) });
      return;
    }
    if (gesture?.type === 'press-wire' && gesture.pointer === event.pointerId) {
      const point = toDrawing(event);
      if (!dragged(gesture.start, point)) return;
      // Pulled far enough: a new wire, starting from a junction where the press was.
      const route = routes.find((r) => r.id === gesture.wire);
      const spot = route && tapPoint(route.points, gesture.start);
      if (!spot) return; // too short a run to tap: it stays a click
      const from: Landing = { tap: { wire: gesture.wire, ...spot } };
      setGesture({ type: 'wire', from, pointer: event.pointerId, start: gesture.start, at: point, target: landingAt(point, from), moved: true });
      return;
    }
    if (gesture?.type === 'turn' && gesture.pointer === event.pointerId) {
      const travel = event.clientX - gesture.startX - (event.clientY - gesture.startY);
      const turn = Math.round(Math.min(1, Math.max(0, gesture.from + travel / TURN_PIXELS)) * 1000) / 1000;
      const now = parts.get(gesture.part);
      if (now && turn !== turnOf(now.props)) props.onTurn(gesture.part, turn);
      return;
    }
    if (gesture?.type === 'box' && gesture.pointer === event.pointerId) {
      const point = toDrawing(event);
      const moved = gesture.moved || dragged(gesture.start, point);
      setGesture({ ...gesture, at: point, moved });
      if (moved) props.onSelect(union(gesture.base, inBox(parts.values(), routes, boxBetween(gesture.start, point))));
      return;
    }
    camera.onPointerMove(event);
  };

  /** Lets go of a push button held by this pointer, if it's holding one. */
  const release = (pointer: number): boolean => {
    const held = holding.current.get(pointer);
    if (held === undefined) return false;
    holding.current.delete(pointer);
    props.onPress(held, false);
    return true;
  };

  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    fingers.current.delete(event.pointerId);
    const tap = emptyTap.current;
    if (tap?.pointer === event.pointerId) {
      emptyTap.current = undefined;
      if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= DRAG_SLOP) props.onSelect(NOTHING);
    }
    if (release(event.pointerId)) return;
    if (gesture?.type === 'move' && gesture.pointer === event.pointerId) {
      if (gesture.moved && (gesture.delta.x !== 0 || gesture.delta.y !== 0)) props.onMove(gesture.ids, gesture.delta.x, gesture.delta.y);
      else if (!gesture.moved && gesture.flip) props.onFlip(gesture.pressed);
      else if (!gesture.moved && gesture.collapse) props.onSelect(only('part', gesture.pressed));
      setGesture(undefined);
      return;
    }
    if (gesture?.type === 'lead' && gesture.pointer === event.pointerId) {
      props.onLead(gesture.tool, gesture.target); // nothing to touch: back in its socket
      setGesture(undefined);
      return;
    }
    if (gesture?.type === 'press-wire' && gesture.pointer === event.pointerId) {
      props.onSelect(only('wire', gesture.wire)); // a click: select it
      setGesture(undefined);
      return;
    }
    if (gesture?.type === 'wire' && gesture.pointer === event.pointerId) {
      if (gesture.target) {
        props.onConnect(gesture.from, gesture.target);
        setGesture(undefined);
      } else if (!gesture.moved && 'pin' in gesture.from) {
        setGesture({ ...gesture, pointer: undefined }); // a click on a pin: now click the other end
      } else {
        setGesture(undefined);
      }
      return;
    }
    if (gesture?.type === 'turn' && gesture.pointer === event.pointerId) {
      setGesture(undefined);
      return;
    }
    if (gesture?.type === 'box' && gesture.pointer === event.pointerId) {
      if (!gesture.moved) props.onSelect(gesture.base); // a plain click on empty board clears the selection
      setGesture(undefined);
      return;
    }
    camera.onPointerUp(event);
  };

  const onContextMenu = (event: MouseEvent<SVGSVGElement>) => {
    event.preventDefault();
    const press = rightPress.current;
    rightPress.current = undefined;
    if (press?.moved) return; // that was a pan
    if (gesture?.type === 'wire') {
      setGesture(undefined);
      return;
    }
    const element = event.target instanceof Element ? event.target : null;
    const at = toDrawing(event);
    const partId = element?.closest('[data-part]')?.getAttribute('data-part') ?? parsePin(element?.closest('[data-pin]')?.getAttribute('data-pin') ?? null)?.part;
    if (partId && parts.has(partId)) {
      if (!includes(selection, 'part', partId)) props.onSelect(only('part', partId));
      props.onMenu({ kind: 'part', id: partId }, event.clientX, event.clientY, at);
      return;
    }
    const wireId = element?.closest('[data-wire]')?.getAttribute('data-wire');
    if (wireId) {
      if (!includes(selection, 'wire', wireId)) props.onSelect(only('wire', wireId));
      props.onMenu({ kind: 'wire', id: wireId }, event.clientX, event.clientY, at);
      return;
    }
    props.onMenu({ kind: 'board' }, event.clientX, event.clientY, at);
  };

  const wiring = gesture?.type === 'wire' ? gesture : undefined;
  const boxing = gesture?.type === 'box' && gesture.moved ? gesture : undefined;
  const classes = [
    'board',
    camera.panning && 'panning',
    spaceHeld && 'space',
    gesture?.type === 'move' && gesture.moved && 'moving',
    gesture?.type === 'lead' && 'dragging',
    wiring && 'wiring',
    boxing && 'boxing',
  ];

  return (
    <div
      className="canvas"
      ref={canvas}
      onPointerEnter={() => {
        hovering.current = true;
      }}
      onPointerLeave={() => {
        hovering.current = false;
      }}
    >
      <svg
        ref={svg}
        className={classes.filter(Boolean).join(' ')}
        viewBox={`${String(box.x)} ${String(box.y)} ${String(box.width)} ${String(box.height)}`}
        role="group"
        aria-label="Your board"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(event) => {
          fingers.current.delete(event.pointerId);
          if (emptyTap.current?.pointer === event.pointerId) emptyTap.current = undefined;
          if (release(event.pointerId)) return;
          setGesture(undefined);
          camera.onPointerUp(event);
        }}
        onContextMenu={onContextMenu}
      >
        <defs>
          <pattern id="board-dots" x={-GRID / 2} y={-GRID / 2} width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <circle cx={GRID / 2} cy={GRID / 2} r="1" className="canvas-dot" />
          </pattern>
          <radialGradient id="board-led-glow">
            <stop offset="0%" stopColor="var(--led)" stopOpacity="0.95" />
            <stop offset="30%" stopColor="var(--led)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--led)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="board-heat-glow">
            <stop offset="0%" stopColor="var(--hot)" stopOpacity="0.7" />
            <stop offset="100%" stopColor="var(--hot)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect className="canvas-bg" x={box.x} y={box.y} width={box.width} height={box.height} fill="url(#board-dots)" />

        {routes.map(({ wire, d }) => (
          <path
            key={wire.id}
            className={selection.wires.includes(wire.id) ? 'wire-line selected' : 'wire-line'}
            d={d}
          />
        ))}
        {routes.map(({ wire, d }) => (
          <path key={wire.id} className="wire-hit" data-wire={wire.id} d={d} aria-label={`Wire ${wire.label}`} />
        ))}

        <LiveUnder sim={sim} parts={parts} routes={routes} />

        {shown.parts.map((part) => (
          <PartView
            key={part.id}
            part={part}
            sim={sim}
            selected={selection.parts.includes(part.id)}
            onSelect={(additive) => {
              props.onSelect(additive ? toggle(selection, 'part', part.id) : only('part', part.id));
            }}
          />
        ))}

        <LiveOver sim={sim} parts={parts} hoverPin={wiring ? undefined : hoverPin} onReplace={props.onReplace} />

        {pinsOf(parts.values()).map(({ ref, at }) => {
          const key = pinKey(ref);
          const isEnd = (landing: Landing | undefined) => landing !== undefined && 'pin' in landing && samePin(landing.pin, ref);
          const lit = wiring && (isEnd(wiring.from) || isEnd(wiring.target));
          const junction = parts.get(ref.part)?.kind === 'junction';
          const className = ['pin-group', junction ? 'junction-pin' : connected.has(key) ? 'connected' : 'open', lit && 'lit']
            .filter(Boolean)
            .join(' ');
          return (
            <g
              key={key}
              className={className}
              data-pin={key}
              onPointerEnter={() => {
                setHoverPin(ref);
              }}
              onPointerLeave={() => {
                setHoverPin((current) => (current && samePin(current, ref) ? undefined : current));
              }}
            >
              <circle className="pin-hit" cx={at.x} cy={at.y} r={10} />
              <circle className="pin" cx={at.x} cy={at.y} r={4} />
            </g>
          );
        })}

        {wiring && <WireInProgress parts={parts} wiring={wiring} />}

        {boxing && <rect className="marquee" {...boxBetween(boxing.start, boxing.at)} />}

        {gesture?.type === 'lead' && gesture.target && (
          <SnapMark at={targetPoint(gesture.target)} radius={9 / scale} />
        )}

        {ghost && (
          <g className="ghost-part" transform={`translate(${String(ghost.at.x)} ${String(ghost.at.y)})`}>
            <PartSymbol kind={ghost.kind} />
          </g>
        )}

        <g transform={`translate(${String(box.x)} ${String(box.y)}) scale(${String(1 / scale)})`}>
          <g className="dock" aria-hidden="true">
            {tools.map((tool) => (
              <g key={tool}>
                <circle className={`jack jack-${tool}`} cx={jack(tool).x} cy={jack(tool).y} r="5" />
                <text className="jack-label" x={jack(tool).x + 12} y={jack(tool).y + 4}>
                  {TOOL_LABEL[tool]}
                </text>
              </g>
            ))}
            <MeterChip
              sim={sim}
              board={board}
              meter={props.meter}
              hideReading={props.hideReading}
              at={{ x: (props.meter.mode === 'volts' ? JACK_X.black : JACK_X.clamp) + 46, y: jackY }}
            />
          </g>
          {tools.map((tool) => {
            const held = gesture?.type === 'lead' && gesture.tool === tool;
            return (
              <g key={tool} className={held ? `tool tool-${tool} held` : `tool tool-${tool}`} data-tool={tool}>
                <ToolShape tool={tool} tip={toScreen(tipOf(tool))} jack={jack(tool)} resting={!held && !placed(tool)} />
              </g>
            );
          })}
        </g>
      </svg>

      <div className="zoom" role="group" aria-label="Zoom">
        <button type="button" onClick={camera.zoomOut} aria-label="Zoom out" title="Zoom out">
          −
        </button>
        <button type="button" className="zoom-level" onClick={() => {
            camera.show(boardBounds(board));
          }}
          title="Fit the parts on screen" aria-label="Fit the parts on screen">
          {`${String(camera.zoomPercent)}%`}
        </button>
        <button type="button" onClick={camera.zoomIn} aria-label="Zoom in" title="Zoom in">
          +
        </button>
      </div>
      {props.children}
    </div>
  );
}

function PartView(props: {
  readonly part: PlacedPart;
  readonly sim: BoardSim;
  readonly selected: boolean;
  /** Enter selects just this part; Shift+Enter adds it to (or takes it from) the selection. */
  readonly onSelect: (additive: boolean) => void;
}) {
  const { part, sim, selected } = props;
  // Re-renders only when the part's state changes (fine → over its rating → burnt), not every frame.
  const status = useSyncExternalStore(sim.subscribe, () => statusOf(sim.getSnapshot().parts[part.id]));
  const lines = labelLines(part);
  const spot = labelSpot(part);
  const outline = partBox(part);
  const { box, name } = CATALOG[part.kind];

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      props.onSelect(event.shiftKey);
    }
  };

  return (
    <g
      className={`part ${part.kind} ${status}${selected ? ' selected' : ''}`}
      data-part={part.id}
      role="button"
      tabIndex={0}
      aria-label={`${part.label}, ${name}${lines[1] ? ` ${lines[1]}` : ''}`}
      aria-pressed={selected}
      onKeyDown={onKeyDown}
    >
      <rect
        className="selection"
        x={outline.x - 8}
        y={outline.y - 8}
        width={outline.width + 16}
        height={outline.height + 16}
        rx="10"
      />
      <g transform={placeAt(part)}>
        <rect className="part-hit" x={box.x} y={box.y} width={box.width} height={box.height} />
        <PartSymbol kind={part.kind} />
        {part.kind === 'switch' && <Lever part={part} />}
        {part.kind === 'button' && <Cap part={part} sim={sim} />}
        {part.kind === 'knob' && <Knob part={part} />}
      </g>
      {lines.map((line, i) => {
        const at = lineAt(part, i, lines.length);
        return (
          <text key={i} className={i === 0 ? 'label' : 'value'} x={at.x} y={at.y} textAnchor={spot.anchor}>
            {line}
          </text>
        );
      })}
    </g>
  );
}

/** A slide switch's lever, and the area around it that a click flips. */
function Lever({ part }: { readonly part: PlacedPart }) {
  return (
    <>
      <SwitchLever side={part.props.side === 'b' ? 'b' : 'a'} />
      <rect className="actuator-hit" data-actuator={part.id} x="-26" y="-30" width="52" height="60" rx="8">
        <title>Click to flip</title>
      </rect>
    </>
  );
}

/** A knob's wiper and dial, turned to where it's set, and the area that turns it. */
function Knob({ part }: { readonly part: PlacedPart }) {
  const turn = turnOf(part.props);
  return (
    <>
      <KnobWiper turn={turn} />
      <KnobDial turn={turn} />
      <rect className="actuator-hit" data-actuator={part.id} x={DIAL.x - 20} y={DIAL.y - 18} width="40" height="36" rx="8">
        <title>Drag up or right to turn it towards pin 3, down or left towards pin 1</title>
      </rect>
    </>
  );
}

/** A push button's cap, drawn down while it's held, and the area that presses it. */
function Cap({ part, sim }: { readonly part: PlacedPart; readonly sim: BoardSim }) {
  const pressed = useSyncExternalStore(sim.subscribe, () => sim.getSnapshot().parts[part.id]?.closed ?? false);
  return (
    <>
      <ButtonCap pressed={pressed} />
      <rect className="actuator-hit" data-actuator={part.id} x="-32" y="-36" width="64" height="34" rx="8">
        <title>Hold to press</title>
      </rect>
    </>
  );
}

interface Route {
  readonly wire: Board['wires'][number];
  readonly d: string;
}

/** Under the parts: current flowing along the wires, and the glow of hot or lit parts. */
function LiveUnder(props: { readonly sim: BoardSim; readonly parts: ReadonlyMap<string, PlacedPart>; readonly routes: readonly Route[] }) {
  const snapshot = useSyncExternalStore(props.sim.subscribe, props.sim.getSnapshot);
  return (
    <g className="live" aria-hidden="true">
      {props.routes.map(({ wire, d }) => {
        const reading = snapshot.wires[wire.id];
        if (!reading || flowSpeed(reading.amps) === 0) return null;
        return (
          <path
            key={wire.id}
            className="flow"
            d={d}
            strokeDasharray={`0 ${String(DOT_SPACING)}`}
            strokeDashoffset={-(reading.flow % DOT_SPACING)}
          />
        );
      })}
      {[...props.parts.values()].map((part) => {
        const reading = snapshot.parts[part.id];
        if (!reading || reading.burnt || !reading.written) return null;
        if (part.kind === 'led') {
          const amps = reading.amps ?? 0;
          const overdrive = Math.min(1, Math.max(0, amps / RED_LED.maxAmps - 1));
          return (
            <circle key={part.id} cx={part.x} cy={part.y} r={58 + overdrive * 34} fill="url(#board-led-glow)" opacity={ledGlow(amps)} />
          );
        }
        if (part.kind === 'resistor' && reading.celsius !== undefined) {
          const heat = Math.min(1, Math.max(0, (reading.celsius - 80) / 220));
          if (heat === 0) return null;
          return (
            <ellipse key={part.id} rx="70" ry="34" fill="url(#board-heat-glow)" opacity={heat} transform={placeAt(part)} />
          );
        }
        return null;
      })}
    </g>
  );
}

/** Over the parts: LEDs lighting up, temperatures, burn-outs, and the voltage at the pin under the pointer. */
function LiveOver(props: {
  readonly sim: BoardSim;
  readonly parts: ReadonlyMap<string, PlacedPart>;
  readonly hoverPin: PinRef | undefined;
  readonly onReplace: (id: string) => void;
}) {
  const snapshot = useSyncExternalStore(props.sim.subscribe, props.sim.getSnapshot);
  const hovered = props.hoverPin && props.parts.get(props.hoverPin.part);
  return (
    <g className="live">
      {[...props.parts.values()].map((part) => {
        const reading = snapshot.parts[part.id];
        if (!reading) return null;
        const lines = labelLines(part).length;
        const spot = labelSpot(part);
        const tempAt = extraLine(part, lines);
        // The Replace pill takes the extra line's place: under the label, or over it when the label's on top.
        const pillTop = spot.stack === 'up' ? tempAt.y - PILL_HEIGHT + 6 : tempAt.y - 6;
        const warm = reading.celsius !== undefined && !reading.burnt && reading.celsius >= 35;
        return (
          <g key={part.id}>
            {part.kind === 'led' && reading.written && !reading.burnt && (
              <g transform={placeAt(part)} aria-hidden="true">
                <LedLight brightness={ledGlow(reading.amps)} />
              </g>
            )}
            {warm && (
              <text className={reading.over ? 'temperature hot' : 'temperature'} x={tempAt.x} y={tempAt.y} textAnchor={spot.anchor}>
                {`${String(Math.round(reading.celsius))} °C`}
              </text>
            )}
            {reading.burnt && <Burst at={{ x: part.x, y: part.y }} />}
            {reading.burnt && (
              <ReplaceButton
                at={{ x: tempAt.x - (spot.anchor === 'end' ? PILL_WIDTH : spot.anchor === 'middle' ? PILL_WIDTH / 2 : 0), y: pillTop }}
                label={`Replace ${part.label}`}
                onPress={() => {
                  props.onReplace(part.id);
                }}
              />
            )}
          </g>
        );
      })}
      {hovered && <PinTip part={hovered} pin={props.hoverPin.pin} snapshot={snapshot} />}
    </g>
  );
}

function PinTip(props: { readonly part: PlacedPart; readonly pin: string; readonly snapshot: BoardSnapshot }) {
  const { part, pin, snapshot } = props;
  const at = pinAt(part, pin);
  const facing = pinFacing(part, pin);
  const name = CATALOG[part.kind].pins.find((p) => p.id === pin)?.name ?? pin;
  const volts = snapshot.pins[`${part.id}.${pin}`];
  const reading = snapshot.grounded && volts !== undefined ? formatSI(volts, 'V', { floor: 1e-6 }) : 'add a ground to read volts';
  // Out past the pin, on the side it faces.
  const x = at.x + facing.x * 14;
  const y = at.y + facing.y * 14 + (facing.y === 0 ? -10 : facing.y < 0 ? -8 : 18);
  const anchor = facing.x > 0 ? 'start' : facing.x < 0 ? 'end' : 'middle';
  return (
    <text className="pin-tip" x={x} y={y} textAnchor={anchor} aria-live="polite">
      <tspan className="pin-name">{`${part.label} ${name}`}</tspan>
      <tspan className="pin-volts" dx="6">
        {reading}
      </tspan>
    </text>
  );
}

/** Where a landing is on the board, and which way a wire leaves it (none from a point along a wire). */
function landingPlace(parts: ReadonlyMap<string, PlacedPart>, landing: Landing): { at: Point; facing: Point | undefined } | undefined {
  if ('tap' in landing) return { at: landing.tap.at, facing: undefined };
  const part = parts.get(landing.pin.part);
  if (!part) return undefined;
  return { at: pinAt(part, landing.pin.pin), facing: part.kind === 'junction' ? undefined : pinFacing(part, landing.pin.pin) };
}

function WireInProgress(props: {
  readonly parts: ReadonlyMap<string, PlacedPart>;
  readonly wiring: Extract<Gesture, { type: 'wire' }>;
}) {
  const { parts, wiring } = props;
  const from = landingPlace(parts, wiring.from);
  if (!from) return null;
  const to = wiring.target && landingPlace(parts, wiring.target);
  const d = to
    ? roundedPath(routeBetween(from.at, from.facing, to.at, to.facing, { a: from.facing ? GRID : 0, b: to.facing ? GRID : 0 }))
    : `M${String(from.at.x)},${String(from.at.y)} L${String(wiring.at.x)},${String(wiring.at.y)}`;
  // Junctions about to be made show where they'll go.
  const taps = [wiring.from, wiring.target].flatMap((landing) => (landing && 'tap' in landing ? [landing.tap.at] : []));
  return (
    <>
      <path className={to ? 'wire-draft landing' : 'wire-draft'} d={d} />
      {taps.map((at) => (
        <circle key={`${String(at.x)},${String(at.y)}`} className="junction-dot preview" cx={at.x} cy={at.y} r="4.5" />
      ))}
    </>
  );
}

function SnapMark({ at, radius }: { readonly at: Point | undefined; readonly radius: number }) {
  return at ? <circle className="snap" cx={at.x} cy={at.y} r={radius} /> : null;
}

/** A meter lead or the clamp, drawn in screen pixels: `tip` is where it touches, `jack` its socket. */
function ToolShape(props: { readonly tool: Tool; readonly tip: Point; readonly jack: Point; readonly resting: boolean }) {
  const { tool, tip, jack, resting } = props;
  const grip = { x: tip.x, y: tip.y + 30 };
  const n = (value: number) => String(Math.round(value * 10) / 10);
  // A cable hangs: down from the grip, then up into the socket from below.
  const sag = Math.max(grip.y, jack.y) + 36;
  const cable = `M${n(grip.x)},${n(grip.y)} C${n(grip.x)},${n(sag)} ${n(jack.x)},${n(sag)} ${n(jack.x)},${n(jack.y)}`;
  return (
    <>
      {!resting && <path className="cable" d={cable} />}
      {tool === 'clamp' ? (
        <>
          <path className="clamp-jaw" d={`M${n(tip.x - 8)},${n(tip.y + 9)} A12,12 0 1 1 ${n(tip.x + 8)},${n(tip.y + 9)}`} />
          <line className="grip-edge" x1={tip.x} y1={tip.y + 13} x2={grip.x} y2={grip.y} />
          <line className="grip" x1={tip.x} y1={tip.y + 13} x2={grip.x} y2={grip.y} />
        </>
      ) : (
        <>
          <line className="needle" x1={tip.x} y1={tip.y} x2={tip.x} y2={tip.y + 10} />
          <line className="grip-edge" x1={tip.x} y1={tip.y + 10} x2={grip.x} y2={grip.y} />
          <line className="grip" x1={tip.x} y1={tip.y + 10} x2={grip.x} y2={grip.y} />
        </>
      )}
      {/* Grabbed by the grip, below the tip: the pin or wire it touches can still be used. */}
      <rect className="tool-hit" x={tip.x - 10} y={tip.y + (tool === 'clamp' ? 14 : 9)} width="20" height="26" rx="6" />
    </>
  );
}

/** The meter's display beside its sockets, live: the reading, "?" until it's guessed, or "—" with nothing to read. */
function MeterChip(props: {
  readonly sim: BoardSim;
  readonly board: Board;
  readonly meter: MeterState;
  readonly hideReading: (key: string) => boolean;
  readonly at: Point;
}) {
  const snapshot = useSyncExternalStore(props.sim.subscribe, props.sim.getSnapshot);
  const measured = measure(props.meter, props.board, snapshot);
  const text =
    typeof measured === 'string'
      ? '—'
      : props.hideReading(measured.key)
        ? '?'
        : formatSI(measured.value, measured.unit, { floor: measured.unit === 'V' ? 1e-6 : 1e-9 });
  return (
    <g className="meter-chip" transform={`translate(${String(props.at.x)} ${String(props.at.y)})`}>
      <rect x="0" y="-13" width="86" height="26" rx="8" />
      <text x="43" y="4.5" textAnchor="middle">
        {text}
      </text>
    </g>
  );
}
