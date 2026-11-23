import { RED_LED } from '@bench/engine';
import { lazy, Suspense, useCallback, useState, useSyncExternalStore } from 'react';
import { BoardCanvas, type MenuTarget } from '../builder/BoardCanvas';
import type { PlacedPart } from '../builder/board';
import { CAPACITOR_VALUES, capacitorSpec, CATALOG, supplyFor, turnOf } from '../builder/catalog';
import { measure } from '../builder/meter';
import { Inspector } from '../builder/Inspector';
import { Palette } from '../builder/Palette';
import { SpecSheetPanel } from '../builder/SpecSheet';
import { useSession, type Session } from '../builder/session';
import { TRACE_SECONDS, type BoardSim } from '../builder/sync';
import { ChargeGraph } from '../components/ChargeGraph';
import { ContextMenu, type MenuEntry } from '../components/ContextMenu';
import { FloatingCard } from '../components/FloatingCard';
import { IvGraph } from '../components/IvGraph';
import { Meter } from '../components/Meter';
import { Switch } from '../components/Switch';
import { YourTurn } from '../components/YourTurn';
import type { Point } from '../geometry';
import { DATASHEET_POINTS, measureLed } from '../kit';
import { LessonPanel } from '../lessons/LessonPanel';
import type { Subject } from '../three/Viewer3d';
import { useShowWindow } from './show';

/**
 * The windows. Each is a thin view of the shared session, so any number can be
 * open, tabbed, split or floating, and they all show the same board.
 */

export function BoardWindow() {
  const session = useSession();
  const { canvas, board, sim, selection, select, moveParts, connect, replace, ghost, meter, placeLead, guessFirst, guesses } = session;
  const [menu, setMenu] = useState<{ x: number; y: number; at: Point; target: MenuTarget } | undefined>(undefined);
  const closeMenu = useCallback(() => {
    setMenu(undefined);
  }, []);

  return (
    <div className="pane pane-board">
      <BoardCanvas
        ref={canvas}
        board={board}
        sim={sim}
        selection={selection}
        onSelect={select}
        onMove={moveParts}
        onConnect={connect}
        onReplace={replace}
        onFlip={session.flip}
        onPress={session.press}
        onTurn={(id, turn) => {
          session.setProp(id, 'turn', turn);
        }}
        onMenu={(target, x, y, at) => {
          setMenu({ target, x, y, at });
        }}
        ghost={ghost}
        meter={meter}
        onLead={placeLead}
        hideReading={(key) => guessFirst && !guesses[key]}
      >
        {board.parts.length === 0 && !ghost && (
          <div className="empty-hint" aria-hidden="true">
            <p>Drag parts in from the Parts window.</p>
            <p>Then drag from pin to pin to wire them up. Right-click for more.</p>
          </div>
        )}
        <StatusCard sim={sim} />
      </BoardCanvas>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={menu.target.kind === 'board' ? 'Board' : 'Selection'}
          entries={menuEntries(session, menu.target, menu.at)}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}

/** What a right-click offers: on empty board, parts to add there; on parts and wires, what to do with the selection. */
function menuEntries(session: Session, target: MenuTarget, at: Point): MenuEntry[] {
  const { board, selection } = session;
  if (target.kind === 'board') {
    return [
      { heading: 'Add here' },
      ...session.parts.map((kind) => ({
        label: CATALOG[kind].name,
        onSelect: () => {
          session.addPart(kind, at);
        },
      })),
      'separator',
      {
        label: 'Paste here',
        shortcut: 'Ctrl+V',
        disabled: !session.canPaste,
        onSelect: () => {
          session.paste(at);
        },
      },
      { label: 'Select all', shortcut: 'Ctrl+A', disabled: board.parts.length === 0, onSelect: session.selectAll },
      'separator',
      {
        label: 'Fit the parts',
        disabled: board.parts.length === 0,
        onSelect: () => {
          session.canvas.current?.fit();
        },
      },
      {
        label: 'Actual size',
        onSelect: () => {
          session.canvas.current?.actualSize();
        },
      },
      { note: 'Move the view: right-drag, Space-drag or middle-drag' },
    ];
  }

  const parts = board.parts.filter((p) => selection.parts.includes(p.id));
  const burnt = parts.filter((p) => session.sim.getSnapshot().parts[p.id]?.burnt);
  const single = board.parts.find((p) => p.id === target.id) ?? board.wires.find((w) => w.id === target.id);
  const heading =
    selection.parts.length + selection.wires.length > 1
      ? `${String(selection.parts.length + selection.wires.length)} selected`
      : single && 'kind' in single
        ? `${single.label} · ${CATALOG[single.kind].name}`
        : `${single?.label ?? ''} · Jumper wire`;
  const entries: MenuEntry[] = [{ heading }];
  const only = parts.length === 1 && selection.wires.length === 0 ? parts[0] : undefined;
  if (only?.kind === 'switch') {
    entries.push({
      label: `Slide to side ${only.props.side === 'b' ? 'A' : 'B'}`,
      onSelect: () => {
        session.flip(only.id);
      },
    });
  }
  if (only?.kind === 'button') {
    const held = session.holds.has(only.id);
    entries.push({
      label: held ? 'Let go' : 'Hold down',
      onSelect: () => {
        session.setHold(only.id, !held);
      },
    });
  }
  if (only?.kind === 'switch' || only?.kind === 'button') entries.push('separator');
  if (parts.length > 0) {
    entries.push(
      {
        label: 'Rotate',
        shortcut: 'R',
        onSelect: () => {
          session.rotate();
        },
      },
      { label: 'Duplicate', shortcut: 'Ctrl+D', onSelect: session.duplicate },
      { label: 'Copy', shortcut: 'Ctrl+C', onSelect: session.copy },
    );
  }
  if (burnt.length > 0) {
    entries.push({
      label: burnt.length === 1 ? 'Replace' : `Replace ${String(burnt.length)} burnt parts`,
      onSelect: () => {
        for (const p of burnt) session.replace(p.id);
      },
    });
  }
  entries.push('separator', { label: 'Delete', shortcut: 'Del', danger: true, onSelect: session.remove });
  return entries;
}

export function PartsWindow() {
  const s = useSession();
  return (
    <div className="pane pane-scroll pane-parts">
      <Palette kinds={s.parts} onCarry={s.carry} onDrop={s.drop} onCancel={s.cancelCarry} />
    </div>
  );
}

export function InspectorWindow() {
  const s = useSession();
  const show = useShowWindow();
  return (
    <div className="pane pane-scroll">
      <Inspector
        board={s.board}
        sim={s.sim}
        selection={s.selection}
        onProp={s.setProp}
        onRotate={() => {
          s.rotate();
        }}
        onDuplicate={s.duplicate}
        onDelete={s.remove}
        onReplace={s.replace}
        onFlip={s.flip}
        holds={s.holds}
        onHold={s.setHold}
        onShowSpec={() => {
          show('spec');
        }}
        onShow3d={() => {
          show('view3d');
        }}
      />
    </div>
  );
}

/** The selected part's spec sheet: its datasheet numbers, and where each comes from. */
export function SpecWindow() {
  const s = useSession();
  return (
    <div className="pane pane-scroll">
      <SpecSheetPanel board={s.board} selection={s.selection} />
    </div>
  );
}

// three.js, react-three-fiber and drei are big: they load the first time the 3D window opens, not with the rest of
// Bench.
const Viewer3d = lazy(() => import('../three/Viewer3d'));

/** The parts that have a 3D model so far. */
type Modelled = 'knob' | 'capacitor' | 'transistor';
const MODELLED: readonly { readonly kind: Modelled; readonly name: string }[] = [
  { kind: 'knob', name: 'Knob' },
  { kind: 'capacitor', name: 'Capacitor' },
  { kind: 'transistor', name: 'Transistor' },
];
const isModelled = (kind: string | undefined): kind is Modelled => MODELLED.some((m) => m.kind === kind);

/**
 * A part in 3D, to work, take apart and look at piece by piece (docs/3d.md): the modelled part selected on the
 * board, linked to it, or one just to look at. It loads (three.js, and a WebGL context) the first time it's
 * `shown`, and stays loaded after, so going back to it finds it as you left it.
 */
export function View3dWindow({ shown = true }: { readonly shown?: boolean }) {
  const [opened, setOpened] = useState(shown);
  if (shown && !opened) setOpened(true);
  return <div className="pane pane-3d">{opened && <View3d />}</div>;
}

function View3d() {
  const s = useSession();
  const snapshot = useSyncExternalStore(s.sim.subscribe, s.sim.getSnapshot);
  const [loose, setLoose] = useState<{ kind: Modelled | undefined; turn: number; uf: (typeof CAPACITOR_VALUES)[number] }>({
    kind: undefined,
    turn: 0.5,
    uf: 1000,
  });
  const chosen = s.board.parts.filter((p) => s.selection.parts.includes(p.id));
  const only = chosen.length === 1 ? chosen[0] : undefined;
  const linked = only && isModelled(only.kind) ? only : undefined;
  const linkedKind = linked && isModelled(linked.kind) ? linked.kind : undefined;
  const reading = linked && snapshot.parts[linked.id];
  // Deselecting a part keeps showing that kind of part, rather than jumping to another.
  if (linkedKind && loose.kind !== linkedKind) setLoose({ ...loose, kind: linkedKind });
  // Nothing modelled selected yet: one to look at, the newest kind the board has, else the knob.
  const onBoard = [...MODELLED].reverse().find((m) => s.board.parts.some((p) => p.kind === m.kind));
  const looseKind = loose.kind ?? onBoard?.kind ?? 'knob';
  const kind = linkedKind ?? looseKind;

  const transistor = reading?.written ? reading.transistor : undefined;
  const subject: Subject =
    kind === 'transistor'
      ? {
          kind,
          label: linked?.label,
          live: transistor && { baseAmps: transistor.baseAmps, collectorAmps: transistor.collectorAmps, state: transistor.state },
        }
      : kind === 'knob'
      ? {
          kind,
          turn: linked ? turnOf(linked.props) : loose.turn,
          onTurn: (turn) => {
            if (linked) s.setProp(linked.id, 'turn', turn);
            else setLoose({ ...loose, turn });
          },
          label: linked?.label,
          live: reading?.written && reading.knob ? { volts: reading.knob.volts, wiperAmps: reading.knob.wiperAmps } : undefined,
        }
      : {
          kind,
          uf: linked ? capacitorValue(linked.props) : loose.uf,
          onUf: linked
            ? undefined
            : (uf) => {
                setLoose({ ...loose, uf });
              },
          label: linked?.label,
          held: reading?.written && reading.capacitor ? reading.capacitor.held : undefined,
        };
  const note = only && !linked ? `${only.label} is selected, and it has no 3D model yet. Here’s one to look at.` : undefined;
  const chooser = !linked && (
    <div className="viewer-sizes" role="group" aria-label="Part">
      {MODELLED.map((m) => (
        <button
          key={m.kind}
          type="button"
          className={m.kind === kind ? 'chip on' : 'chip'}
          aria-pressed={m.kind === kind}
          onClick={() => {
            setLoose({ ...loose, kind: m.kind });
          }}
        >
          {m.name}
        </button>
      ))}
    </div>
  );

  return (
    <Suspense fallback={<p className="pane-note viewer-loading">Loading 3D…</p>}>
      <Viewer3d key={kind} subject={subject} note={note} chooser={chooser} />
    </Suspense>
  );
}

/**
 * The Graph: a capacitor's voltage over time, or an LED's current against its voltage. It draws the selected one,
 * or the first capacitor, or the first LED.
 */
export function GraphWindow() {
  const { board, sim, selection } = useSession();
  const snapshot = useSyncExternalStore(sim.subscribe, sim.getSnapshot);
  const graphed = board.parts.filter((p) => p.kind === 'capacitor' || p.kind === 'led');
  const chosen =
    graphed.find((p) => selection.parts.includes(p.id)) ??
    graphed.find((p) => p.kind === 'capacitor') ??
    graphed.find((p) => p.kind === 'led');
  if (chosen?.kind === 'capacitor') {
    const trace = sim.trace(chosen.id);
    const batteries = board.parts.filter((p) => p.kind === 'battery').map((p) => supplyFor(p.props.supply).volts);
    const written = snapshot.parts[chosen.id]?.written !== false;
    return (
      <div className="pane pane-scroll graph-pane">
        <p className="pane-note">
          {written
            ? `${chosen.label}’s voltage over the last ${String(TRACE_SECONDS)} seconds. Click an LED to graph it instead.`
            : `${chosen.label} isn’t in the circuit until your capacitor is written.`}
        </p>
        <ChargeGraph
          times={trace?.times ?? []}
          volts={trace?.volts ?? []}
          now={snapshot.time}
          span={TRACE_SECONDS}
          supply={batteries.length > 0 ? Math.max(...batteries) : undefined}
        />
        <p className="graph-note">
          Charging, it climbs fast, then slower and slower: the fuller it is, the less push is left to fill it. Filling
          from empty through a resistor, with nothing else on it, it reaches the dotted 63 % line in resistance ×
          capacitance seconds.
        </p>
      </div>
    );
  }
  return <LedGraph chosen={chosen} />;
}

/** The selected LED's current against its voltage: your model's curve, the datasheet's dots, and where it is now. */
function LedGraph({ chosen }: { readonly chosen: PlacedPart | undefined }) {
  const { sim } = useSession();
  const snapshot = useSyncExternalStore(sim.subscribe, sim.getSnapshot);
  const [curve] = useState(measureLed);
  const reading = chosen && snapshot.parts[chosen.id];
  const operating =
    reading?.written && !reading.burnt && reading.amps !== undefined ? { volts: reading.volts, amps: reading.amps } : undefined;

  return (
    <div className="pane pane-scroll graph-pane">
      <p className="pane-note">
        {chosen
          ? `${chosen.label}${reading?.burnt ? ', burnt out' : ''}. Click another LED to graph it instead.`
          : 'Add an LED to see where it settles, or a capacitor to watch it fill.'}
      </p>
      <IvGraph curve={curve} datasheet={DATASHEET_POINTS} operating={operating} maxAmps={RED_LED.maxAmps} />
      <p className="graph-note">
        The line is your LED model, the dots are the real LED read off its datasheet, and the bright dot is where it is
        right now.
      </p>
    </div>
  );
}

/** The multimeter's face: Volts or Amps, the reading, and guessing it first. Its leads live on the board. */
export function MeterWindow() {
  const s = useSession();
  const snapshot = useSyncExternalStore(s.sim.subscribe, s.sim.getSnapshot);
  const measured = measure(s.meter, s.board, snapshot);
  const measurement = typeof measured === 'string' ? undefined : measured;
  const anyPlaced = Object.values(s.meter.leads).some(Boolean);
  return (
    <div className="pane pane-scroll meter-pane">
      <Meter
        mode={s.meter.mode}
        onMode={s.setMeterMode}
        measurement={measurement}
        prompt={typeof measured === 'string' ? measured : ''}
        guessFirst={s.guessFirst}
        record={measurement && s.guesses[measurement.key]}
        onReveal={s.reveal}
        onForget={s.forget}
      />
      <Switch label="Guess before measuring" detail="The meter waits for your guess." checked={s.guessFirst} onChange={s.setGuessFirst} />
      {anyPlaced && (
        <button type="button" className="link" onClick={s.stowLeads}>
          Put the leads away
        </button>
      )}
    </div>
  );
}

export function LessonWindow() {
  return (
    <div className="pane pane-scroll">
      <LessonPanel />
    </div>
  );
}

/** A card over the board when something needs you: a part model to write, or a circuit that won't settle. */
function StatusCard({ sim }: { readonly sim: BoardSim }) {
  const snapshot = useSyncExternalStore(sim.subscribe, sim.getSnapshot);
  const [folded, setFolded] = useState(false);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const missing = snapshot.notWritten.at(0);
  const card = snapshot.error
    ? { eyebrow: 'Something threw', title: 'Fix it and save', tone: 'problem' as const, body: <pre>{snapshot.error}</pre> }
    : !snapshot.converged
      ? {
          eyebrow: 'Didn’t settle',
          title: 'The solver gave up',
          tone: 'problem' as const,
          body: (
            <p>
              {snapshot.unsettled.length > 0
                ? `It couldn’t find a voltage where ${snapshot.unsettled.join(' and ')} agrees with itself.`
                : 'It couldn’t settle this circuit.'}
            </p>
          ),
        }
      : missing
        ? {
            eyebrow: 'Your turn',
            title: `${missing.part} needs its model`,
            tone: 'turn' as const,
            body: (
              <YourTurn
                part={missing.part}
                file={missing.file}
                methods={snapshot.notWritten.filter((m) => m.part === missing.part).map((m) => m.method)}
              />
            ),
          }
        : undefined;
  if (!card) return null;
  return (
    <FloatingCard
      eyebrow={card.eyebrow}
      title={card.title}
      tone={card.tone}
      collapsed={folded}
      onCollapsedChange={setFolded}
      offset={offset}
      onOffsetChange={setOffset}
    >
      {card.body}
    </FloatingCard>
  );
}

/** A capacitor's size from its saved setting, µF. */
function capacitorValue(props: Readonly<Record<string, string | number>>): (typeof CAPACITOR_VALUES)[number] {
  const microfarads = Math.round(capacitorSpec(props).farads * 1e6);
  return CAPACITOR_VALUES.find((uf) => uf === microfarads) ?? 1000;
}
