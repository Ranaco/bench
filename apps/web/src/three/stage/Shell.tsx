import type { KeyboardEvent, ReactNode } from 'react';
import type { PieceInfo } from '../core/model';

interface ShellProps {
  /** The part's name or label, then what it is. */
  readonly title: string;
  readonly subtitle: string;
  readonly hint: string;
  /** Buttons along the top: take it apart, and the part's own. */
  readonly tools: ReactNode;
  /** Switching which part to look at, when it isn't one from the board. */
  readonly chooser?: ReactNode;
  readonly pieces: readonly string[];
  readonly info: Readonly<Partial<Record<string, PieceInfo>>>;
  readonly selected: string | undefined;
  readonly onSelect: (piece: string | undefined) => void;
  readonly onHover: (piece: string | undefined) => void;
  readonly hidden: ReadonlySet<string>;
  readonly onToggleHidden: (piece: string) => void;
  /** Live readings for the selected piece, under what it does. */
  readonly cardExtra?: ReactNode;
  /** The line of numbers along the bottom. */
  readonly readout: ReactNode;
  /** A control along the bottom: a knob's turn, for anyone who'd rather not drag. */
  readonly control?: ReactNode;
  readonly help: string;
  /** The cursor over the model: pointing at a piece, at a handle, or dragging one. */
  readonly cursor: '' | 'point' | 'grab' | 'turning';
  readonly onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  /** Spoken name of the 3D area. */
  readonly label: string;
  /** The 3D stage itself. */
  readonly children: ReactNode;
}

/** Everything round a part in 3D: what it is, what you can do with it, and a card for the piece you've picked. */
export function Shell(props: ShellProps) {
  const { selected, hidden } = props;
  const info = selected === undefined ? undefined : props.info[selected];
  return (
    <div className="viewer">
      <div
        className={`viewer-stage${props.cursor ? ` ${props.cursor}` : ''}`}
        tabIndex={0}
        role="application"
        aria-label={props.label}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            props.onSelect(undefined);
            return;
          }
          props.onKeyDown?.(event);
        }}
      >
        {props.children}
      </div>

      <div className="viewer-top">
        <div className="viewer-head">
          <p className="viewer-title">
            <strong>{props.title}</strong>
            <span>{props.subtitle}</span>
          </p>
          <p className="viewer-hint">{props.hint}</p>
          {props.chooser && <div className="viewer-choices">{props.chooser}</div>}
        </div>
        <div className="viewer-tools">{props.tools}</div>
      </div>

      <div className="viewer-foot">
        {info && selected !== undefined && (
          <section className="viewer-card" aria-live="polite">
            <header>
              <h3>{info.name}</h3>
              <button
                type="button"
                className="icon"
                aria-label="Close"
                onClick={() => {
                  props.onSelect(undefined);
                }}
              >
                ×
              </button>
            </header>
            <p>{info.does}</p>
            {props.cardExtra}
            <p className="viewer-source">{info.source}</p>
            <button
              type="button"
              className="link"
              onClick={() => {
                props.onToggleHidden(selected);
              }}
            >
              {hidden.has(selected) ? 'Show it' : 'Hide it'}
            </button>
          </section>
        )}

        <div className="viewer-readout">{props.readout}</div>
        {props.control}
        <nav className="viewer-pieces" aria-label="Pieces">
          {props.pieces.map((id) => (
            <button
              key={id}
              type="button"
              className={`chip${selected === id ? ' on' : ''}${hidden.has(id) ? ' off' : ''}`}
              aria-pressed={selected === id}
              onClick={() => {
                props.onSelect(selected === id ? undefined : id);
              }}
              onPointerEnter={() => {
                props.onHover(id);
              }}
              onPointerLeave={() => {
                props.onHover(undefined);
              }}
            >
              {props.info[id]?.name ?? id}
            </button>
          ))}
        </nav>
        <p className="viewer-help">{props.help}</p>
      </div>
    </div>
  );
}

/** The buttons every part has: take it apart, show what's hidden, back to the start. */
export function CommonTools(props: {
  readonly apart: boolean;
  readonly onApart: () => void;
  readonly hiddenCount: number;
  readonly onShowAll: () => void;
  readonly onReset: () => void;
  readonly children?: ReactNode;
}) {
  return (
    <>
      <button type="button" className={props.apart ? 'chip on' : 'chip'} aria-pressed={props.apart} onClick={props.onApart}>
        {props.apart ? 'Put it together' : 'Take it apart'}
      </button>
      {props.children}
      {props.hiddenCount > 0 && (
        <button type="button" className="chip" onClick={props.onShowAll}>
          Show all ({props.hiddenCount} hidden)
        </button>
      )}
      <button type="button" className="chip" onClick={props.onReset}>
        Reset view
      </button>
    </>
  );
}
