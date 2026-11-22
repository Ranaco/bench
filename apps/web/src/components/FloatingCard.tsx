import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import type { Point } from '../geometry';

interface FloatingCardProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly tone: 'turn' | 'problem';
  readonly collapsed: boolean;
  readonly onCollapsedChange: (collapsed: boolean) => void;
  /** How far it has been dragged from its home at the bottom centre, in pixels. */
  readonly offset: Point;
  readonly onOffsetChange: (offset: Point) => void;
  readonly children: ReactNode;
}

interface Drag {
  readonly pointer: number;
  readonly startX: number;
  readonly startY: number;
  readonly from: Point;
  readonly limits: { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number };
}

const EDGE = 8;

/**
 * A card that floats over the canvas. Drag it by its top bar, double-click the
 * bar to send it home, and fold it down to just its title.
 */
export function FloatingCard(props: FloatingCardProps) {
  const { eyebrow, title, tone, collapsed, offset } = props;
  const card = useRef<HTMLElement>(null);
  const [drag, setDrag] = useState<Drag | undefined>(undefined);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button'))) return;
    const element = card.current;
    const stage = element?.offsetParent;
    if (!element || !stage) return;
    const box = element.getBoundingClientRect();
    const area = stage.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      pointer: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      from: offset,
      // Keep the whole card inside the canvas.
      limits: {
        minX: offset.x - (box.left - area.left) + EDGE,
        maxX: offset.x + (area.right - box.right) - EDGE,
        minY: offset.y - (box.top - area.top) + EDGE,
        maxY: offset.y + (area.bottom - box.bottom) - EDGE,
      },
    });
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (drag?.pointer !== event.pointerId) return;
    const { limits } = drag;
    props.onOffsetChange({
      x: Math.min(limits.maxX, Math.max(limits.minX, drag.from.x + event.clientX - drag.startX)),
      y: Math.min(limits.maxY, Math.max(limits.minY, drag.from.y + event.clientY - drag.startY)),
    });
  };

  const stop = (event: PointerEvent<HTMLElement>) => {
    if (drag?.pointer === event.pointerId) setDrag(undefined);
  };

  const style = { '--dx': `${String(offset.x)}px`, '--dy': `${String(offset.y)}px` } as CSSProperties;
  const classes = ['card', 'floating', tone, collapsed && 'collapsed', drag && 'moving'].filter(Boolean).join(' ');

  return (
    <aside ref={card} className={classes} style={style} aria-label={`${eyebrow}: ${title}`}>
      <header
        className="card-bar"
        title="Drag to move · double-click to put back"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
        onDoubleClick={() => {
          props.onOffsetChange({ x: 0, y: 0 });
        }}
      >
        <div className="card-heading">
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <button
          type="button"
          className="card-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand' : 'Minimize'}
          title={collapsed ? 'Expand' : 'Minimize'}
          onClick={() => {
            props.onCollapsedChange(!collapsed);
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
      </header>
      {/* Always rendered, so folding can animate; inert while folded. */}
      <div className="card-fold" inert={collapsed} aria-hidden={collapsed}>
        <div className="card-body">
          <div className="card-inner">{props.children}</div>
        </div>
      </div>
    </aside>
  );
}
