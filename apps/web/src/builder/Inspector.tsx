import { AMBIENT_CELSIUS, awgArea, conductorOhms, JUMPER } from '@bench/engine';
import { useSyncExternalStore } from 'react';
import { formatSI } from '../format';
import type { Board, PlacedPart, WireDoc } from './board';
import { CATALOG } from './catalog';
import { isEmpty, size, type Selection } from './selection';
import { sheetFor } from './specs';
import { amps, volts } from '../kinds/view';
import { VIEWS } from '../kinds/views';
import type { BoardSim, BoardSnapshot, PartReading } from '../sim';
import type { CodeView } from '../code/asked';

interface InspectorProps {
  readonly board: Board;
  readonly sim: BoardSim;
  readonly selection: Selection;
  readonly onProp: (id: string, key: string, value: string | number) => void;
  /** Turns the selected parts. */
  readonly onRotate: () => void;
  readonly onDuplicate: () => void;
  /** Removes everything selected. */
  readonly onDelete: () => void;
  readonly onReplace: (id: string) => void;
  /** Slides a slide switch to its other side. */
  readonly onFlip: (id: string) => void;
  /** Push buttons kept held down, and holding or letting one go. */
  readonly holds: ReadonlySet<string>;
  readonly onHold: (id: string, held: boolean) => void;
  /** Brings up the Spec sheet window. */
  readonly onShowSpec: () => void;
  /** Brings up the 3D window. */
  readonly onShow3d: () => void;
  /** Brings up the Code window: at an ESP32's program, or at a part's source. */
  readonly onShowCode?: (what: CodeView) => void;
}

/** A wire's resistance at room temperature, from its length, copper and its size: what the circuit uses for it. */
const wireOhms = (wire: WireDoc) => conductorOhms(JUMPER.conductor, wire.metres, awgArea(JUMPER.gauge), AMBIENT_CELSIUS);


/** What's selected, and what it's doing right now. */
export function Inspector(props: InspectorProps) {
  const { board, sim, selection } = props;
  const snapshot = useSyncExternalStore(sim.subscribe, sim.getSnapshot);

  const one = size(selection) === 1;
  const part = one ? board.parts.find((p) => p.id === selection.parts.at(0)) : undefined;
  const wire = one ? board.wires.find((w) => w.id === selection.wires.at(0)) : undefined;

  // While a program switches pins, the numbers are a meter's: averages, four times a second (see sim/readout.ts).
  const readout = snapshot.readout;
  if (part) {
    return (
      <PartInspector
        {...props}
        part={part}
        reading={snapshot.parts[part.id]}
        metered={readout?.parts[part.id]}
        pins={readout ? { ...snapshot.pins, ...readout.pins } : snapshot.pins}
      />
    );
  }
  if (wire) return <WireInspector wire={wire} amps={readout?.wires[wire.id] ?? snapshot.wires[wire.id]?.amps} onDelete={props.onDelete} />;
  if (!isEmpty(selection)) return <GroupInspector {...props} />;

  return (
    <section className="inspector" aria-label="Nothing selected">
      <p className="inspector-empty">
        Nothing yet. Click a part or a wire to see what it’s doing. To wire two pins, drag from one to the other, or
        click one and then the other.
      </p>
      <p className="aside">
        Shift-click or drag a box to select several. Right-click anything for what you can do with it. To move the view,
        right-drag, Space-drag or middle-drag.
      </p>
      {board.parts.length > 0 && !snapshot.grounded && (
        <p className="aside">
          No ground yet. Currents are right without one, but a voltage only means something measured from somewhere:
          wire a ground to a battery’s minus and every pin reads from there.
        </p>
      )}
    </section>
  );
}

/** A part's current, voltage and power as a meter shows them: averaged, while a program's switching pins. */
type Metered = NonNullable<BoardSnapshot['readout']>['parts'][string];

function PartInspector(
  props: InspectorProps & {
    readonly part: PlacedPart;
    readonly reading: PartReading | undefined;
    readonly metered: Metered | undefined;
    readonly pins: BoardSnapshot['pins'];
  },
) {
  const { part, reading } = props;
  const kind = CATALOG[part.kind];
  const view = VIEWS[part.kind];
  return (
    <section className="inspector" aria-labelledby="inspector-label">
      <div className="row">
        <h2 id="inspector-label">
          {part.label} · {kind.name}
        </h2>
      </div>
      <p className="inspector-blurb">{kind.blurb}.</p>

      {view.Controls && (
        <view.Controls
          part={part}
          reading={reading}
          onProp={props.onProp}
          onFlip={props.onFlip}
          holds={props.holds}
          onHold={props.onHold}
        />
      )}

      {reading && view.state?.(reading) && <p className="part-state">{view.state(reading)}</p>}
      {reading && <Readings part={part} reading={props.metered ? { ...reading, ...props.metered } : reading} pins={props.pins} />}

      {reading?.burnt && (
        <div className="notice-row">
          <p>Burnt out: it no longer conducts.</p>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              props.onReplace(part.id);
            }}
          >
            Replace
          </button>
        </div>
      )}
      {reading?.over && view.overWarning && <p className="warning">{view.overWarning(part, reading)}</p>}

      {(sheetFor(part.kind, part.props) !== undefined || view.in3d === true || kind.modules.length > 0) && (
        <div className="see-also">
          {part.kind === 'esp32' && props.onShowCode && (
            <button
              type="button"
              className="ghost spec-link"
              onClick={() => {
                props.onShowCode?.({ view: 'program' });
              }}
            >
              Edit program
            </button>
          )}
          {kind.modules.length > 0 && props.onShowCode && (
            <button
              type="button"
              className="ghost spec-link"
              onClick={() => {
                props.onShowCode?.({ view: 'source' });
              }}
            >
              Edit source
            </button>
          )}
          {sheetFor(part.kind, part.props) && (
            <button type="button" className="ghost spec-link" onClick={props.onShowSpec}>
              Spec sheet
            </button>
          )}
          {view.in3d && (
            <button type="button" className="ghost spec-link" onClick={props.onShow3d}>
              See it in 3D
            </button>
          )}
        </div>
      )}

      <div className="actions">
        <button
          type="button"
          className="ghost"
          aria-keyshortcuts="R"
          onClick={props.onRotate}
        >
          Rotate <kbd>R</kbd>
        </button>
        <button type="button" className="ghost" aria-keyshortcuts="Control+D" onClick={props.onDuplicate}>
          Duplicate
        </button>
        <button type="button" className="ghost" aria-keyshortcuts="Delete" onClick={props.onDelete}>
          Delete <kbd>⌫</kbd>
        </button>
      </div>
    </section>
  );
}

/** Several things selected: what they are, and what can be done to them all at once. */
function GroupInspector(props: InspectorProps) {
  const { board, sim, selection } = props;
  const snapshot = useSyncExternalStore(sim.subscribe, sim.getSnapshot);
  const parts = board.parts.filter((p) => selection.parts.includes(p.id));
  const burnt = parts.filter((p) => snapshot.parts[p.id]?.burnt);
  const count = (n: number, one: string) => `${String(n)} ${one}${n === 1 ? '' : 's'}`;
  const what = [parts.length > 0 && count(parts.length, 'part'), selection.wires.length > 0 && count(selection.wires.length, 'wire')];
  return (
    <section className="inspector" aria-labelledby="inspector-label">
      <h2 id="inspector-label">{what.filter(Boolean).join(' and ')} selected</h2>
      {parts.length > 0 && (
        <p className="inspector-blurb">{parts.map((p) => p.label).join(', ')}</p>
      )}
      {burnt.length > 0 && (
        <div className="notice-row">
          <p>{burnt.map((p) => p.label).join(', ')} burnt out.</p>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              for (const p of burnt) props.onReplace(p.id);
            }}
          >
            Replace
          </button>
        </div>
      )}
      <div className="actions">
        {parts.length > 0 && (
          <>
            <button type="button" className="ghost" aria-keyshortcuts="R" onClick={props.onRotate}>
              Rotate <kbd>R</kbd>
            </button>
            <button type="button" className="ghost" aria-keyshortcuts="Control+D" onClick={props.onDuplicate}>
              Duplicate
            </button>
          </>
        )}
        <button type="button" className="ghost" aria-keyshortcuts="Delete" onClick={props.onDelete}>
          Delete <kbd>⌫</kbd>
        </button>
      </div>
    </section>
  );
}

function Readings(props: {
  readonly part: PlacedPart;
  readonly reading: PartReading;
  /** Volts at every pin, from ground. */
  readonly pins: BoardSnapshot['pins'];
}) {
  const { part, reading } = props;
  const pin = (id: string) => props.pins[`${part.id}.${id}`] ?? 0;
  const rows = VIEWS[part.kind].rows?.(part, reading, pin) ?? [];
  return (
    <dl className="readings">
      {rows.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function WireInspector(props: { readonly wire: WireDoc; readonly amps: number | undefined; readonly onDelete: () => void }) {
  const { wire } = props;
  const current = props.amps ?? 0;
  const ohms = wireOhms(wire);
  const cm = formatSI(wire.metres * 100, '', { digits: 2, trim: true });
  const piece = wire.a.through || wire.b.through ? ', the share of a jumper on this side of its junction' : '';
  return (
    <section className="inspector" aria-labelledby="inspector-label">
      <h2 id="inspector-label">{wire.label} · Jumper wire</h2>
      <p className="inspector-blurb">
        {`${cm} cm of ${String(JUMPER.gauge)} AWG copper${piece}. A real wire, so it has a little resistance.`}
      </p>
      <dl className="readings">
        <div>
          <dt>Current along it</dt>
          <dd>{amps(Math.abs(current))}</dd>
        </div>
        <div>
          <dt>Resistance</dt>
          <dd>{formatSI(ohms, 'Ω', { digits: 2 })}</dd>
        </div>
        <div>
          <dt>Voltage lost along it</dt>
          <dd>{volts(Math.abs(current) * ohms)}</dd>
        </div>
      </dl>
      <div className="actions">
        <button type="button" className="ghost" aria-keyshortcuts="Delete" onClick={props.onDelete}>
          Delete <kbd>⌫</kbd>
        </button>
      </div>
    </section>
  );
}
