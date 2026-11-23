import { AMBIENT_CELSIUS, awgArea, conductorOhms, JUMPER, KNOB_10K, PN2222A, RED_LED, SLIDE_SWITCH, TACT_SWITCH, type SwitchSpec } from '@bench/engine';
import { useSyncExternalStore, type CSSProperties } from 'react';
import { bandsFor } from '../bands';
import { Segmented } from '../components/Segmented';
import { formatSI } from '../format';
import { SUPPLIES } from '../kit';
import type { Board, PlacedPart, WireDoc } from './board';
import { CAPACITOR_VALUES, capacitorSpec, CATALOG, RESISTOR_VALUES, supplyFor, turnOf } from './catalog';
import { isEmpty, size, type Selection } from './selection';
import { sheetFor } from './specs';
import type { BoardSim, BoardSnapshot, PartReading } from './sync';

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
}

/** What a switch's contacts are rated for, as its datasheet puts it. */
const rating = (spec: SwitchSpec) =>
  `${formatSI(spec.ratedAmps, 'A', { trim: true })} at ${formatSI(spec.ratedVolts, 'V', { trim: true })} DC`;

/** A wire's resistance at room temperature, from its length, copper and its size: what the circuit uses for it. */
/** The parts the 3D view can show, linked to the one selected. */
const IN_3D: ReadonlySet<PlacedPart['kind']> = new Set(['knob', 'capacitor', 'transistor']);

/** A transistor's ratings, as one line: collector current, collector-emitter voltage, heat. */
const TRANSISTOR_LIMITS = [
  formatSI(PN2222A.maxCollectorAmps, 'A', { trim: true }),
  formatSI(PN2222A.maxCollectorVolts, 'V', { trim: true }),
  formatSI(PN2222A.maxWatts, 'W', { trim: true }),
].join(' · ');

/** How a pin is set up, in words. */
const MODE_TEXT = { input: 'input', pullup: 'input, pull-up', pulldown: 'input, pull-down', output: 'output' } as const;

/** What a pin reads, in words. */
const LEVEL_TEXT = { high: 'HIGH', low: 'LOW', unknown: '? (could be either)' } as const;

/** What a transistor's state means, in a few words. */
const TRANSISTOR_STATE = {
  off: 'Off: nothing into the base, so nothing through',
  amplifying: 'Amplifying: the base current sets the collector’s',
  on: 'Switched fully on: the rest of the circuit sets the current',
} as const;

const wireOhms = (wire: WireDoc) => conductorOhms(JUMPER.conductor, wire.metres, awgArea(JUMPER.gauge), AMBIENT_CELSIUS);

const amps = (value: number | undefined) => (value === undefined ? '—' : formatSI(value, 'A', { floor: 1e-9 }));
const volts = (value: number) => formatSI(value, 'V', { floor: 1e-6 });
const watts = (value: number) => formatSI(value, 'W', { floor: 1e-9 });

/** What's selected, and what it's doing right now. */
export function Inspector(props: InspectorProps) {
  const { board, sim, selection } = props;
  const snapshot = useSyncExternalStore(sim.subscribe, sim.getSnapshot);

  const one = size(selection) === 1;
  const part = one ? board.parts.find((p) => p.id === selection.parts.at(0)) : undefined;
  const wire = one ? board.wires.find((w) => w.id === selection.wires.at(0)) : undefined;

  if (part) return <PartInspector {...props} part={part} reading={snapshot.parts[part.id]} pins={snapshot.pins} />;
  if (wire) return <WireInspector wire={wire} amps={snapshot.wires[wire.id]?.amps} onDelete={props.onDelete} />;
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

function PartInspector(
  props: InspectorProps & { readonly part: PlacedPart; readonly reading: PartReading | undefined; readonly pins: BoardSnapshot['pins'] },
) {
  const { part, reading } = props;
  const kind = CATALOG[part.kind];
  return (
    <section className="inspector" aria-labelledby="inspector-label">
      <div className="row">
        <h2 id="inspector-label">
          {part.label} · {kind.name}
        </h2>
      </div>
      <p className="inspector-blurb">{kind.blurb}.</p>

      {part.kind === 'battery' && (
        <Segmented
          label="Supply"
          options={SUPPLIES.map((s) => ({ value: s.id, label: s.label, detail: s.detail }))}
          value={supplyFor(part.props.supply).id}
          onChange={(id) => {
            props.onProp(part.id, 'supply', id);
          }}
        />
      )}
      {part.kind === 'switch' && (
        <Segmented
          label="Slid to"
          options={[
            { value: 'a', label: 'Side A', detail: 'common to A' },
            { value: 'b', label: 'Side B', detail: 'common to B' },
          ]}
          value={part.props.side === 'b' ? 'b' : 'a'}
          onChange={(side) => {
            if (side !== (part.props.side === 'b' ? 'b' : 'a')) props.onFlip(part.id); // the side it's on already: nothing to do
          }}
        />
      )}
      {part.kind === 'button' && (
        <div className="notice-row">
          <p>{reading?.closed ? 'Held down: its contacts touch.' : 'Up: its contacts are apart.'}</p>
          <button
            type="button"
            className="ghost"
            aria-pressed={props.holds.has(part.id)}
            onClick={() => {
              props.onHold(part.id, !props.holds.has(part.id));
            }}
          >
            {props.holds.has(part.id) ? 'Let go' : 'Hold down'}
          </button>
        </div>
      )}
      {part.kind === 'knob' && (
        <KnobControl
          turn={turnOf(part.props)}
          onChange={(turn) => {
            props.onProp(part.id, 'turn', turn);
          }}
        />
      )}
      {part.kind === 'capacitor' && (
        <Segmented
          label="Capacitance"
          options={CAPACITOR_VALUES.map((uf) => ({ value: String(uf), label: String(uf), detail: 'µF' }))}
          value={String(Math.round(capacitorSpec(part.props).farads * 1e6))}
          onChange={(uf) => {
            props.onProp(part.id, 'uf', Number(uf));
          }}
        />
      )}
      {part.kind === 'resistor' && (
        <ResistorPicker
          ohms={Number(part.props.ohms)}
          onChange={(ohms) => {
            props.onProp(part.id, 'ohms', ohms);
          }}
        />
      )}

      {reading?.transistor?.state && reading.written && <p className="part-state">{TRANSISTOR_STATE[reading.transistor.state]}</p>}
      {reading && <Readings part={part} reading={reading} pins={props.pins} />}

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
      {reading?.over && part.kind === 'led' && (
        <p className="warning">Over its {formatSI(RED_LED.maxAmps, 'A', { trim: true })} rating: it’s heating up.</p>
      )}
      {reading?.over && part.kind === 'resistor' && <p className="warning">Hotter than it’s rated to run.</p>}
      {reading?.capacitor?.reversed && (
        <p className="warning">
          Charged the wrong way round: minus is above plus. An electrolytic’s insulating layer only works one way,
          which is why it has a pressure relief vent for when things go wrong. The datasheet gives no numbers for it,
          so Bench only warns.
        </p>
      )}
      {reading?.capacitor && !reading.capacitor.reversed && reading.over && (
        <p className="warning">{`Charged past its ${String(reading.capacitor.ratedVolts)} V rating.`}</p>
      )}
      {reading?.over && part.kind === 'knob' && (
        <p className="warning">
          {`Over its ${formatSI(KNOB_10K.ratedWatts, 'W', { trim: true })} rating: a carbon track run this hot wears and chars. The datasheet has no heat data, so Bench only warns.`}
        </p>
      )}
      {reading?.over && part.kind === 'esp32' && (
        <p className="warning">
          A pin is past what the datasheet allows: more than its typical 40 mA out or 28 mA in, or a voltage outside
          −0.3 to 3.6 V. Bench doesn’t model the damage, so it only warns.
        </p>
      )}
      {reading?.over && part.kind === 'transistor' && (
        <p className="warning">
          {`Past what its datasheet allows (${TRANSISTOR_LIMITS}). Bench doesn’t model a transistor’s heat, so it only warns.`}
        </p>
      )}
      {reading?.over && (part.kind === 'switch' || part.kind === 'button') && (
        <p className="warning">
          {`More current than its contacts are rated for (${rating(part.kind === 'switch' ? SLIDE_SWITCH : TACT_SWITCH)}). The datasheet doesn’t say how long they’d last, so Bench won’t guess.`}
        </p>
      )}

      {(sheetFor(part.kind, part.props) !== undefined || IN_3D.has(part.kind)) && (
        <div className="see-also">
          {sheetFor(part.kind, part.props) && (
            <button type="button" className="ghost spec-link" onClick={props.onShowSpec}>
              Spec sheet
            </button>
          )}
          {IN_3D.has(part.kind) && (
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
  const rows: [string, string][] = [];
  switch (part.kind) {
    case 'switch': {
      const open = part.props.side === 'b' ? 'a' : 'b';
      rows.push([`Current, common to side ${part.props.side === 'b' ? 'B' : 'A'}`, amps(reading.amps)]);
      rows.push([`Across the open side, ${open.toUpperCase()}`, volts(Math.abs(pin('common') - pin(open)))]);
      rows.push(['Contacts rated for', rating(SLIDE_SWITCH)]);
      break;
    }
    case 'button':
      rows.push(['Current through it', amps(reading.amps)]);
      rows.push(['Across it', volts(Math.abs(reading.volts))]);
      rows.push(['Contacts rated for', rating(TACT_SWITCH)]);
      break;
    case 'battery':
      rows.push(['Current out of +', amps(reading.amps)]);
      rows.push(['Across its terminals', volts(reading.volts)]);
      // What reaches the circuit: whatever its internal resistance burns is already taken off.
      rows.push(['Into the circuit', watts(Math.max(0, -reading.watts))]);
      break;
    case 'ground':
      rows.push(['Current into ground', amps(reading.amps)]);
      break;
    case 'knob': {
      const knob = reading.knob;
      if (!knob) break;
      rows.push(['Pin 1 to the wiper', `${formatSI(knob.legs[0], 'Ω', { digits: 3 })} · ${volts(knob.volts[0])}`]);
      rows.push(['Wiper to pin 3', `${formatSI(knob.legs[1], 'Ω', { digits: 3 })} · ${volts(knob.volts[1])}`]);
      rows.push(['Current out of the wiper', amps(knob.wiperAmps)]);
      rows.push(['Turning into heat', watts(reading.watts)]);
      rows.push(['Rated for', formatSI(KNOB_10K.ratedWatts, 'W', { trim: true })]);
      break;
    }
    case 'capacitor': {
      const cap = reading.capacitor;
      if (!cap) break;
      const flowing = reading.amps ?? 0;
      rows.push(['Holding', volts(cap.held)]);
      rows.push([flowing >= 0 ? 'Current in, filling it' : 'Current out, emptying it', amps(Math.abs(flowing))]);
      // ½ × C × V²: what it took to charge it, and what it can give back.
      rows.push(['Energy stored', formatSI(0.5 * cap.farads * cap.held ** 2, 'J', { digits: 3 })]);
      const spec = capacitorSpec(part.props);
      rows.push(['Leak across it, the worst allowed', formatSI(spec.ratedVolts / spec.leakAmps, 'Ω', { digits: 3 })]);
      rows.push(['Rated for', formatSI(cap.ratedVolts, 'V', { trim: true })]);
      break;
    }
    case 'esp32': {
      const chip = reading.chip;
      if (!chip) break;
      rows.push(['3V3 to GND', volts(reading.volts)]);
      rows.push(['Out of its 3.3 V supply', amps(chip.supplyAmps)]);
      const idle: string[] = [];
      for (const pin of Object.values(chip.pins)) {
        // A plain input with nothing holding it: not worth a row of its own.
        if (pin.mode === 'input' && pin.floating) {
          idle.push(`GPIO${String(pin.gpio)}`);
          continue;
        }
        const level = pin.mode === 'output' ? (pin.high ? 'driving HIGH' : 'driving LOW') : pin.level ? LEVEL_TEXT[pin.level] : '—';
        const at = pin.floating ? 'floating' : volts(pin.volts);
        const analog = pin.analog === undefined ? '' : ` · analogRead ${String(pin.analog)}`;
        const current = pin.mode === 'input' || pin.amps === undefined ? '' : ` · ${amps(pin.amps)}`;
        rows.push([`GPIO${String(pin.gpio)}`, `${MODE_TEXT[pin.mode]} · ${level} · ${at}${analog}${current}`]);
      }
      if (idle.length > 0) rows.push(['Not connected', idle.join(', ')]);
      break;
    }
    case 'transistor': {
      const q = reading.transistor;
      if (!q) break;
      rows.push(['Into the base', amps(q.baseAmps)]);
      rows.push(['Collector to emitter', amps(q.collectorAmps)]);
      // The gain only means something while there's base current to divide by, and a collector current to divide.
      if (q.state !== 'off' && q.collectorAmps !== undefined) {
        rows.push(['Collector ÷ base', `× ${(q.collectorAmps / q.baseAmps).toFixed(0)}`]);
      }
      rows.push(['Across it, collector to emitter', volts(q.collectorVolts)]);
      rows.push(['Base to emitter', volts(q.baseVolts)]);
      rows.push(['Turning into heat', watts(reading.watts)]);
      rows.push(['Rated for', TRANSISTOR_LIMITS]);
      break;
    }
    case 'resistor':
    case 'led':
      rows.push(['Current through it', amps(reading.amps)]);
      rows.push(['Across it', volts(reading.volts)]);
      rows.push(['Turning into heat' + (part.kind === 'led' ? ' and light' : ''), watts(reading.watts)]);
      if (reading.celsius !== undefined) rows.push([part.kind === 'led' ? 'Junction' : 'Body', `${reading.celsius.toFixed(1)} °C`]);
      break;
  }
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

/** How far a knob is turned, as a slider: left is all the way towards pin 1, right towards pin 3. */
function KnobControl({ turn, onChange }: { readonly turn: number; readonly onChange: (turn: number) => void }) {
  const degrees = `${String(Math.round(turn * KNOB_10K.turnDegrees))}° of ${String(KNOB_10K.turnDegrees)}°`;
  const fill = { '--fill': `${String(turn * 100)}%` } as CSSProperties;
  return (
    <div className="resistor-control">
      <div className="row">
        <span id="knob-label" className="field-label">
          Turned
        </span>
        <output htmlFor="knob">{degrees}</output>
      </div>
      <input
        id="knob"
        type="range"
        min={0}
        max={1000}
        step={1}
        value={Math.round(turn * 1000)}
        style={fill}
        aria-labelledby="knob-label"
        aria-valuetext={degrees}
        onChange={(event) => {
          onChange(Number(event.target.value) / 1000);
        }}
      />
      <div className="row knob-ends" aria-hidden="true">
        <span>towards pin 1</span>
        <span>towards pin 3</span>
      </div>
    </div>
  );
}

/** Picks a value from the kit's resistors, with its colour bands. */
function ResistorPicker({ ohms, onChange }: { readonly ohms: number; readonly onChange: (ohms: number) => void }) {
  const index = Math.max(0, RESISTOR_VALUES.indexOf(ohms));
  const last = RESISTOR_VALUES.length - 1;
  const bands = bandsFor(ohms);
  const label = formatSI(ohms, 'Ω', { trim: true });
  const fill = { '--fill': `${String((index / last) * 100)}%` } as CSSProperties;
  return (
    <div className="resistor-control">
      <div className="row">
        <span id="picker-label" className="field-label">
          Value
        </span>
        <span className="resistor-value">
          <span className="mini-resistor" title={bands.map((b) => b.name).join(', ')} aria-hidden="true">
            {bands.map((band, i) => (
              <span key={i} style={{ background: band.color }} />
            ))}
          </span>
          <output htmlFor="picker">{label}</output>
        </span>
      </div>
      <input
        id="picker"
        type="range"
        min={0}
        max={last}
        step={1}
        value={index}
        style={fill}
        aria-labelledby="picker-label"
        aria-valuetext={label}
        onChange={(event) => {
          onChange(RESISTOR_VALUES[Number(event.target.value)]);
        }}
      />
    </div>
  );
}
