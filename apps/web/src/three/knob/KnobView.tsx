import { GROUND, KNOB_10K, Potentiometer } from '@bench/engine';
import { invalidate } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import * as THREE from 'three';
import { formatSI } from '../../format';
import { PartStage, type DragHandler, type StageHandle, type StageLabel } from '../stage/PartStage';
import { CommonTools, Shell } from '../stage/Shell';
import { usePart } from '../stage/usePart';
import { TINT_TO_PIN1, TINT_TO_PIN3, buildKnob } from './buildKnob';
import { angleStep, settle, turnForDegrees, turnForDrag } from './knob3d';
import { PIECE_IDS, PIECES, TURNS_IT } from './pieces';

/** What the circuit says about the knob, when it's on the board and your model is written. */
export interface KnobLive {
  /** Volts from pin 1 to the wiper, and from the wiper to pin 3. */
  readonly volts: readonly [number, number];
  /** Amps out of the wiper. */
  readonly wiperAmps: number;
}

export interface KnobViewProps {
  readonly turn: number;
  readonly onTurn: (turn: number) => void;
  /** The knob's label when it's the one selected on the board; otherwise this one is only to look at. */
  readonly label: string | undefined;
  readonly note?: string;
  readonly live: KnobLive | undefined;
  readonly chooser?: ReactNode;
}

const ohms = (value: number) => formatSI(value, 'Ω', { trim: true });
const tinted = (color: string) => ({ '--tint': color }) as CSSProperties;

/** The two pieces of the track, by your model's own legs() (written for you, so this works before stamp is). */
function legsAt(turn: number): readonly [number, number] {
  return new Potentiometer('3D', GROUND, GROUND, GROUND, turn).legs();
}

/** A drag that's turning the shaft: where it started, and how it's being measured. */
interface Turning {
  readonly from: number;
  /** Round the shaft (seen from near its tip), or straight across it (seen from the side). */
  readonly around: boolean;
  /** −1 seen from underneath, where clockwise on screen is anticlockwise for the knob. */
  readonly sign: number;
  readonly cx: number;
  readonly cy: number;
  readonly x: number;
  readonly y: number;
  angle: number;
  sum: number;
  sent: number;
}

const degreesAt = (x: number, y: number, cx: number, cy: number) => (Math.atan2(y - cy, x - cx) * 180) / Math.PI;

/** The knob in 3D: turn it by its shaft, take it apart, and look at every piece. */
export function KnobView({ turn, onTurn, label, note, live, chooser }: KnobViewProps) {
  const model = useMemo(() => buildKnob(), []);
  useEffect(() => () => {
    model.dispose();
  }, [model]);
  const stage = useRef<StageHandle>(null);
  const part = usePart(model, stage);
  const [colour, setColour] = useState(true);
  const [dragging, setDragging] = useState(false);
  const turning = useRef<Turning | undefined>(undefined);
  const latest = useRef({ turn, onTurn });
  useEffect(() => {
    latest.current = { turn, onTurn };
  });

  useEffect(() => {
    model.setTurn(turn);
    invalidate();
  }, [model, turn]);
  useEffect(() => {
    model.setTinted(colour);
    invalidate();
  }, [model, colour]);

  // Dragging the shaft turns it. Seen from near its tip, drag round it; seen from the side, drag across it, like the
  // dial on the board (docs/3d.md §6). Past a stop it doesn't wind up.
  const drag = useMemo((): DragHandler => {
    const centre = new THREE.Vector3();
    const toCamera = new THREE.Vector3();
    return {
      pieces: TURNS_IT,
      start(event, { camera, rect }) {
        model.shaftCentre.getWorldPosition(centre);
        toCamera.copy(camera.position).sub(centre).normalize();
        const facing = toCamera.y;
        centre.project(camera);
        const cx = rect.left + ((centre.x + 1) / 2) * rect.width;
        const cy = rect.top + ((1 - centre.y) / 2) * rect.height;
        const from = latest.current.turn;
        turning.current = {
          from,
          around: Math.abs(facing) > 0.45,
          sign: facing >= 0 ? 1 : -1,
          cx,
          cy,
          x: event.clientX,
          y: event.clientY,
          angle: degreesAt(event.clientX, event.clientY, cx, cy),
          sum: 0,
          sent: from,
        };
        setDragging(true);
      },
      move(event) {
        const t = turning.current;
        if (!t) return;
        let next: number;
        if (t.around) {
          const angle = degreesAt(event.clientX, event.clientY, t.cx, t.cy);
          t.sum += angleStep(t.angle, angle) * t.sign;
          t.angle = angle;
          next = settle(t.from + turnForDegrees(t.sum));
          t.sum = (next - t.from) * KNOB_10K.turnDegrees;
        } else {
          next = settle(t.from + turnForDrag(event.clientX - t.x, event.clientY - t.y));
        }
        if (next === t.sent) return;
        t.sent = next;
        model.setTurn(next);
        invalidate();
        latest.current.onTurn(next);
      },
      end() {
        turning.current = undefined;
        setDragging(false);
      },
    };
  }, [model]);

  const legs = legsAt(turn);
  const labels: StageLabel[] = [];
  for (const [n, id] of (['pin1', 'pin2', 'pin3'] as const).entries()) {
    if (!part.hidden.has(id)) labels.push({ key: id, anchor: model.anchors[id], text: String(n + 1) });
  }
  if (colour && part.opened && !part.hidden.has('track')) {
    labels.push({ key: 'toPin1', anchor: model.anchors.toPin1, text: ohms(legs[0]), tint: TINT_TO_PIN1 });
    labels.push({ key: 'toPin3', anchor: model.anchors.toPin3, text: ohms(legs[1]), tint: TINT_TO_PIN3 });
  }

  const nudge = (by: number) => {
    const next = settle(turn + by);
    if (next !== turn) onTurn(next);
  };
  const selected = part.selected;
  const onEnd = turn <= KNOB_10K.deadZone ? 'end1' : turn >= 1 - KNOB_10K.deadZone ? 'end3' : undefined;

  return (
    <Shell
      title={label ?? 'A knob to look at'}
      subtitle="Bourns PTV09A-4 · 10 kΩ · 15 mm flat shaft"
      hint={note ?? (label ? 'Turning it here turns it on your board.' : 'Not on your board: select a knob there to link them.')}
      chooser={chooser}
      label="The knob in 3D. Arrow keys turn it."
      tools={
        <CommonTools
          apart={part.apart}
          onApart={() => {
            part.setApartTo(!part.apart);
          }}
          hiddenCount={part.hidden.size}
          onShowAll={part.showAll}
          onReset={part.reset}
        >
          <button
            type="button"
            className={colour ? 'chip on' : 'chip'}
            aria-pressed={colour}
            onClick={() => {
              setColour(!colour);
            }}
          >
            Colour the two pieces
          </button>
        </CommonTools>
      }
      pieces={PIECE_IDS}
      info={PIECES}
      selected={selected}
      onSelect={part.setSelected}
      onHover={part.setHovered}
      hidden={part.hidden}
      onToggleHidden={part.toggleHidden}
      cursor={dragging ? 'turning' : part.hovered && TURNS_IT.has(part.hovered) ? 'grab' : part.hovered ? 'point' : ''}
      onKeyDown={(event) => {
        const by = event.shiftKey ? 0.1 : 0.01;
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nudge(by);
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nudge(-by);
        else return;
        event.preventDefault();
      }}
      cardExtra={
        <>
          {(selected === 'track' || selected === 'shaft' || selected === 'wiper') && (
            <p className="viewer-live">
              <span style={tinted(TINT_TO_PIN1)}>Pin 1 to the wiper {ohms(legs[0])}</span>
              <span style={tinted(TINT_TO_PIN3)}>Wiper to pin 3 {ohms(legs[1])}</span>
            </p>
          )}
          {(selected === 'end1' || selected === 'end3') && (
            <p className="viewer-live">
              {onEnd === selected ? 'The wiper is on it now: turning here changes nothing.' : 'Turn the shaft all the way to this end to put the wiper on it.'}
            </p>
          )}
          {live && (selected === 'pin1' || selected === 'pin2' || selected === 'pin3') && (
            <p className="viewer-live">
              {selected === 'pin2'
                ? `${formatSI(Math.abs(live.wiperAmps), 'A')} through the wiper right now.`
                : selected === 'pin1'
                  ? `${formatSI(live.volts[0], 'V')} from here to the wiper right now.`
                  : `${formatSI(live.volts[1], 'V')} from the wiper to here right now.`}
            </p>
          )}
        </>
      }
      readout={
        <>
          <span>
            Turned {Math.round(turn * KNOB_10K.turnDegrees)}° of {KNOB_10K.turnDegrees}°
          </span>
          <span style={tinted(TINT_TO_PIN1)}>pin 1 → wiper {ohms(legs[0])}</span>
          <span style={tinted(TINT_TO_PIN3)}>wiper → pin 3 {ohms(legs[1])}</span>
        </>
      }
      control={
        <label className="viewer-control">
          <span>Turn</span>
          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={Math.round(turn * 1000)}
            aria-valuetext={`${String(Math.round(turn * KNOB_10K.turnDegrees))} degrees of ${String(KNOB_10K.turnDegrees)}`}
            onChange={(event) => {
              onTurn(settle(Number(event.target.value) / 1000));
            }}
          />
        </label>
      }
      help="Drag the shaft to turn it · drag elsewhere to look around · scroll or pinch to zoom"
    >
      <PartStage
        model={model}
        hidden={part.hidden}
        hovered={part.hovered}
        selected={selected}
        onHover={part.setHovered}
        onSelect={part.setSelected}
        labels={labels}
        drag={drag}
        handle={stage}
        shapeKey={String(part.apart)}
      />
    </Shell>
  );
}
