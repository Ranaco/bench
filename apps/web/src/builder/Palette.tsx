import { useState, type MouseEvent, type PointerEvent } from 'react';
import type { PartKind } from './board';
import { CATALOG } from './catalog';
import { PaletteIcon } from './symbols';

interface PaletteProps {
  /** The parts on offer: all of them in Build, the ones a lesson has unlocked in a lesson. */
  readonly kinds: readonly PartKind[];
  /** The part is being carried over the screen at this point. */
  readonly onCarry: (kind: PartKind, clientX: number, clientY: number) => void;
  /** Let go: dropped at this point, or just clicked (dragged: false). */
  readonly onDrop: (kind: PartKind, clientX: number, clientY: number, dragged: boolean) => void;
  readonly onCancel: () => void;
}

interface Carry {
  readonly kind: PartKind;
  readonly pointer: number;
  readonly startX: number;
  readonly startY: number;
  readonly dragged: boolean;
}

/** How far, in pixels, a press has to move before it's a drag rather than a click. */
const DRAG_SLOP = 4;

/** The parts box: drag a part onto the board, or click it to put one in the middle of the view. */
export function Palette(props: PaletteProps) {
  const [carry, setCarry] = useState<Carry | undefined>(undefined);

  const start = (kind: PartKind) => (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || carry) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setCarry({ kind, pointer: event.pointerId, startX: event.clientX, startY: event.clientY, dragged: false });
  };

  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (carry?.pointer !== event.pointerId) return;
    const dragged = carry.dragged || Math.hypot(event.clientX - carry.startX, event.clientY - carry.startY) > DRAG_SLOP;
    if (dragged !== carry.dragged) setCarry({ ...carry, dragged });
    if (dragged) props.onCarry(carry.kind, event.clientX, event.clientY);
  };

  const end = (event: PointerEvent<HTMLButtonElement>) => {
    if (carry?.pointer !== event.pointerId) return;
    props.onDrop(carry.kind, event.clientX, event.clientY, carry.dragged);
    setCarry(undefined);
  };

  // Enter or Space on a tile: a click with no pointer behind it.
  const keyboard = (kind: PartKind) => (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0) props.onDrop(kind, 0, 0, false);
  };

  return (
    <div className="palette" role="group" aria-label="Parts">
        {props.kinds.map((kind) => (
          <button
            key={kind}
            type="button"
            className={carry?.kind === kind && carry.dragged ? 'palette-item carried' : 'palette-item'}
            title={`${CATALOG[kind].name}: ${CATALOG[kind].blurb}. Drag onto the board, or click to add.`}
            aria-label={CATALOG[kind].name}
            onPointerDown={start(kind)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={() => {
              setCarry(undefined);
              props.onCancel();
            }}
            onClick={keyboard(kind)}
          >
            <PaletteIcon kind={kind} />
            <span className="palette-name" aria-hidden="true">
              {CATALOG[kind].tile ?? CATALOG[kind].name}
            </span>
          </button>
        ))}
    </div>
  );
}
