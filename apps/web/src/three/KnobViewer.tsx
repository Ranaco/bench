import { GROUND, KNOB_10K, Potentiometer } from '@bench/engine';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { formatSI } from '../format';
import { buildKnob, TINT_TO_PIN1, TINT_TO_PIN3, type KnobModel } from './buildKnob';
import { angleStep, settle, turnForDegrees, turnForDrag } from './knob3d';
import { PIECE_IDS, PIECES, TURNS_IT, type PieceId } from './pieces';

/** What the circuit says about the knob, when it's on the board and your model is written. */
export interface KnobLive {
  /** Volts from pin 1 to the wiper, and from the wiper to pin 3. */
  readonly volts: readonly [number, number];
  /** Amps out of the wiper. */
  readonly wiperAmps: number;
}

export interface KnobViewerProps {
  readonly turn: number;
  readonly onTurn: (turn: number) => void;
  /** The knob's label when it's the one selected on the board; otherwise this one is only to look at. */
  readonly label: string | undefined;
  /** Why it's showing a knob that isn't on the board, if something else is selected. */
  readonly note?: string;
  readonly live: KnobLive | undefined;
}

/** Where the camera starts, and goes back to: in front, above and to the right, the pins towards you. */
const HOME = { position: new THREE.Vector3(31, 33, 52), target: new THREE.Vector3(0, 4, 0) };
/** Taken apart, the pieces stand three times as tall: look higher, from further away. */
const APART_VIEW = { lift: 10, distance: 1.5 };
const APART_MS = 650;
/** Pixels a press can wander and still count as a click. */
const CLICK_SLOP = 4;

const ohms = (value: number) => formatSI(value, 'Ω', { trim: true });

/** The two pieces of the track, by your model's own legs() (written for you, so this works before stamp is). */
function legsAt(turn: number): readonly [number, number] {
  return new Potentiometer('3D', GROUND, GROUND, GROUND, turn).legs();
}

/** Whether this browser will draw 3D at all (some have WebGL switched off). */
function canDraw3d(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

/** A drag that turns the shaft: where it started, and how it's measured. */
interface TurnDrag {
  readonly from: number;
  /** Round the shaft (seen from near its tip), or straight across it (seen from the side). */
  readonly around: boolean;
  /** −1 when looking at it from underneath, where clockwise on screen is anticlockwise for the knob. */
  readonly sign: number;
  /** The shaft's centre on screen. */
  readonly cx: number;
  readonly cy: number;
  angle: number;
  sum: number;
  sent: number;
}

/** A press on the stage: where it began, and the turn it started if it landed on the shaft. */
interface Press {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly turn?: TurnDrag;
}

/**
 * Puts the camera at its starting place, further back in a narrow window (a phone held upright) so the knob still
 * fits across it, and higher and further back the more it's taken apart.
 */
function placeHome(camera: THREE.PerspectiveCamera, controls: OrbitControls, apart: number): void {
  const narrow = Math.max(1, (1.1 / camera.aspect) ** 0.75);
  const distance = narrow * (1 + apart * (APART_VIEW.distance - 1));
  controls.target.copy(HOME.target).setY(HOME.target.y + apart * APART_VIEW.lift);
  camera.position.copy(HOME.position).sub(HOME.target).multiplyScalar(distance).add(controls.target);
}

interface Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly model: KnobModel;
  readonly labels: Readonly<Record<'pin1' | 'pin2' | 'pin3' | 'toPin1' | 'toPin3', HTMLElement>>;
  /** Shows or hides the labels on the two pieces of track (they only make sense with the knob taken apart). */
  readonly showPieceLabels: (visible: boolean) => void;
  readonly render: () => void;
}

/**
 * The knob in 3D, to turn, take apart and look at piece by piece. Drag the
 * shaft to turn it; drag anywhere else to look around it.
 */
export default function KnobViewer({ turn, onTurn, label, note, live }: KnobViewerProps) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | undefined>(undefined);
  const [failed] = useState(() => !canDraw3d());
  const [hovered, setHovered] = useState<PieceId | undefined>(undefined);
  const [selected, setSelected] = useState<PieceId | undefined>(undefined);
  const [hidden, setHidden] = useState<ReadonlySet<PieceId>>(new Set());
  const [apart, setApart] = useState(false);
  const [tinted, setTinted] = useState(true);
  const [turning, setTurning] = useState(false);
  const explode = useRef(0);

  // The latest props and state, for the pointer handlers set up once below.
  const latest = useRef({ turn, onTurn, hidden, tinted });
  useEffect(() => {
    latest.current = { turn, onTurn, hidden, tinted };
  });

  // Set the scene up once; take it all down again when the window closes.
  useEffect(() => {
    const element = host.current;
    if (!element || failed) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // canDraw3d() said yes, then the browser said no: leave the stage empty rather than crash Bench
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const overlay = new CSS2DRenderer();
    overlay.domElement.className = 'viewer-labels';
    element.prepend(overlay.domElement);
    element.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.04).texture;
    scene.environment = environment;
    scene.environmentIntensity = 0.9;
    const key = new THREE.DirectionalLight('#ffffff', 1.4);
    key.position.set(18, 40, 26);
    scene.add(key);

    const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 600);
    const controls = new OrbitControls(camera, renderer.domElement);
    placeHome(camera, controls, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 16;
    controls.maxDistance = 160;
    controls.zoomToCursor = true;

    const model = buildKnob();
    scene.add(model.root);

    const tag = (text: string, className: string) => {
      const div = document.createElement('div');
      div.className = className;
      div.textContent = text;
      return div;
    };
    const labels = {
      pin1: tag('1', 'viewer-tag'),
      pin2: tag('2', 'viewer-tag'),
      pin3: tag('3', 'viewer-tag'),
      toPin1: tag('', 'viewer-tag piece'),
      toPin3: tag('', 'viewer-tag piece'),
    };
    labels.toPin1.style.setProperty('--tint', TINT_TO_PIN1);
    labels.toPin3.style.setProperty('--tint', TINT_TO_PIN3);
    const objects = (Object.keys(labels) as (keyof typeof labels)[]).map((id) => {
      const object = new CSS2DObject(labels[id]);
      model.anchors[id].add(object);
      return object;
    });
    const pieceLabels = objects.slice(3);

    let frame = 0;
    const draw = () => {
      frame = 0;
      const moving = controls.update();
      renderer.render(scene, camera);
      overlay.render(scene, camera);
      if (moving) render();
    };
    const render = () => {
      if (frame === 0) frame = requestAnimationFrame(draw);
    };
    controls.addEventListener('change', render);
    const showPieceLabels = (visible: boolean) => {
      for (const object of pieceLabels) object.visible = visible;
    };
    stage.current = { renderer, camera, controls, model, labels, showPieceLabels, render };

    // Until you move the camera yourself, it keeps the whole knob in view as the window changes shape.
    let moved = false;
    controls.addEventListener('start', () => {
      moved = true;
    });
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height);
      overlay.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (!moved) placeHome(camera, controls, explode.current);
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();

    // Pointing: which piece is under the pointer.
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const shown = (object: THREE.Object3D | null): boolean => !object || (object.visible && shown(object.parent));
    const pick = (x: number, y: number): PieceId | undefined => {
      const box = element.getBoundingClientRect();
      ndc.set(((x - box.left) / box.width) * 2 - 1, -((y - box.top) / box.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(model.pickables.filter((m) => shown(m)), false).at(0);
      return hit && model.pieceOf(hit.object);
    };

    // A press on the shaft turns the knob; anywhere else is the camera's (or a click on a piece).
    let press: Press | undefined;
    const centre = new THREE.Vector3();
    const toCamera = new THREE.Vector3();
    const angleAt = (x: number, y: number, cx: number, cy: number) => (Math.atan2(y - cy, x - cx) * 180) / Math.PI;

    const down = (event: PointerEvent) => {
      if (press || event.button !== 0) return;
      const piece = pick(event.clientX, event.clientY);
      press = { id: event.pointerId, x: event.clientX, y: event.clientY };
      if (!piece || !TURNS_IT.has(piece)) return;
      // Seen from near the shaft's tip (or its other end), turn it by dragging round it; seen from the side, by
      // dragging across it, like the dial on the board.
      model.shaftCentre.getWorldPosition(centre);
      toCamera.copy(camera.position).sub(centre).normalize();
      const facing = toCamera.y;
      centre.project(camera);
      const box = element.getBoundingClientRect();
      const cx = box.left + ((centre.x + 1) / 2) * box.width;
      const cy = box.top + ((1 - centre.y) / 2) * box.height;
      const from = latest.current.turn;
      press = {
        ...press,
        turn: { from, around: Math.abs(facing) > 0.45, sign: facing >= 0 ? 1 : -1, cx, cy, angle: angleAt(event.clientX, event.clientY, cx, cy), sum: 0, sent: from },
      };
      event.stopPropagation(); // keep it from the camera
      element.setPointerCapture(event.pointerId);
      setTurning(true);
      setSelected('shaft');
    };

    let hoverFrame = 0;
    let lastHover: PieceId | undefined;
    const move = (event: PointerEvent) => {
      const t = press?.turn;
      if (press && t && event.pointerId === press.id) {
        let next: number;
        if (t.around) {
          const angle = angleAt(event.clientX, event.clientY, t.cx, t.cy);
          t.sum += angleStep(t.angle, angle) * t.sign;
          t.angle = angle;
          next = settle(t.from + turnForDegrees(t.sum));
          t.sum = (next - t.from) * KNOB_10K.turnDegrees; // past a stop, it doesn't wind up
        } else {
          next = settle(t.from + turnForDrag(event.clientX - press.x, event.clientY - press.y));
        }
        if (next !== t.sent) {
          t.sent = next;
          model.setTurn(next);
          render();
          latest.current.onTurn(next);
        }
        return;
      }
      if (press || hoverFrame !== 0) return;
      const { clientX, clientY } = event;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        const piece = pick(clientX, clientY);
        if (piece === lastHover) return;
        lastHover = piece;
        setHovered(piece);
      });
    };

    const up = (event: PointerEvent) => {
      const ended = press;
      if (!ended) return;
      if (event.pointerId !== ended.id) return;
      const wasTurning = Boolean(ended.turn);
      const still = Math.hypot(event.clientX - ended.x, event.clientY - ended.y) <= CLICK_SLOP;
      press = undefined;
      if (wasTurning) {
        setTurning(false);
        return;
      }
      if (still) setSelected(pick(event.clientX, event.clientY));
    };
    const leave = () => {
      if (lastHover === undefined) return;
      lastHover = undefined;
      setHovered(undefined);
    };

    element.addEventListener('pointerdown', down, { capture: true });
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    element.addEventListener('pointerleave', leave);

    return () => {
      element.removeEventListener('pointerdown', down, { capture: true });
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
      element.removeEventListener('pointerleave', leave);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(hoverFrame);
      observer.disconnect();
      controls.dispose();
      model.dispose();
      environment.dispose();
      room.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      overlay.domElement.remove();
      stage.current = undefined;
    };
  }, [failed]);

  // The turn: the shaft, the wiper, and the two pieces of track and their labels.
  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    const [toPin1, toPin3] = legsAt(turn);
    s.model.setTurn(turn);
    s.labels.toPin1.textContent = ohms(toPin1);
    s.labels.toPin3.textContent = ohms(toPin3);
    s.render();
  }, [turn]);
  const legs = legsAt(turn);

  // What's hidden, lit up and tinted.
  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    s.model.setHidden(hidden);
    s.model.setHighlight(hovered, selected);
    s.model.setTinted(tinted);
    s.showPieceLabels(tinted && explode.current > 0.6);
    s.render();
  }, [hidden, hovered, selected, tinted]);

  // Taking it apart and putting it back, eased; at once for people who'd rather not see things move.
  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    const target = apart ? 1 : 0;
    const start = explode.current;
    if (start === target) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // The camera moves with it, keeping the way you're looking: up and back to see the whole stack, then home.
    const { camera, controls } = s;
    const fromTarget = controls.target.clone();
    const toTarget = fromTarget.clone().setY(fromTarget.y + (target - start) * APART_VIEW.lift);
    const offset = camera.position.clone().sub(fromTarget);
    const fromDistance = offset.length();
    const scale = (amount: number) => 1 + amount * (APART_VIEW.distance - 1);
    const toDistance = (fromDistance * scale(target)) / scale(start);
    offset.normalize();
    let frame = 0;
    const began = performance.now();
    const step = (now: number) => {
      const t = still ? 1 : Math.min(1, (now - began) / APART_MS);
      const eased = 1 - (1 - t) ** 3;
      explode.current = start + (target - start) * eased;
      s.model.setExplode(explode.current);
      controls.target.lerpVectors(fromTarget, toTarget, eased);
      camera.position.copy(controls.target).addScaledVector(offset, fromDistance + (toDistance - fromDistance) * eased);
      s.showPieceLabels(latest.current.tinted && explode.current > 0.6);
      s.render();
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [apart]);

  const nudge = (by: number) => {
    const next = settle(turn + by);
    if (next !== turn) onTurn(next);
  };
  const resetView = () => {
    const s = stage.current;
    if (!s) return;
    placeHome(s.camera, s.controls, explode.current);
    s.controls.update();
    s.render();
  };
  const toggleHidden = (id: PieceId) => {
    setHidden((was) => {
      const next = new Set(was);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };


  const degrees = Math.round(turn * KNOB_10K.turnDegrees);
  const onEnd = turn <= KNOB_10K.deadZone ? 'end1' : turn >= 1 - KNOB_10K.deadZone ? 'end3' : undefined;

  return (
    <div className="viewer">
      <div
        ref={host}
        className={`viewer-stage${turning ? ' turning' : hovered && TURNS_IT.has(hovered) ? ' grab' : hovered ? ' point' : ''}`}
        tabIndex={0}
        role="application"
        aria-label="The knob in 3D. Arrow keys turn it."
        onKeyDown={(event) => {
          const by = event.shiftKey ? 0.1 : 0.01;
          if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nudge(by);
          else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nudge(-by);
          else if (event.key === 'Escape') setSelected(undefined);
          else return;
          event.preventDefault();
        }}
      >
        {failed && <p className="viewer-failed">3D needs WebGL, and this browser has it turned off.</p>}
      </div>

      <div className="viewer-top">
        <div className="viewer-head">
          <p className="viewer-title">
            {label ? <strong>{label}</strong> : <strong>A knob to look at</strong>}
            <span>Bourns PTV09A-4 · 10 kΩ · 15 mm flat shaft</span>
          </p>
          <p className="viewer-hint">
            {note ?? (label ? 'Turning it here turns it on your board.' : 'Not on your board: select a knob there to link them.')}
          </p>
        </div>

        <div className="viewer-tools">
          <button type="button" className={apart ? 'chip on' : 'chip'} aria-pressed={apart} onClick={() => { setApart(!apart); }}>
            {apart ? 'Put it together' : 'Take it apart'}
          </button>
          <button type="button" className={tinted ? 'chip on' : 'chip'} aria-pressed={tinted} onClick={() => { setTinted(!tinted); }}>
            Colour the two pieces
          </button>
          {hidden.size > 0 && (
            <button type="button" className="chip" onClick={() => { setHidden(new Set()); }}>
              Show all ({hidden.size} hidden)
            </button>
          )}
          <button type="button" className="chip" onClick={resetView}>
            Reset view
          </button>
        </div>
      </div>

      {selected && (
        <section className="viewer-card" aria-live="polite">
          <header>
            <h3>{PIECES[selected].name}</h3>
            <button type="button" className="icon" aria-label="Close" onClick={() => { setSelected(undefined); }}>
              ×
            </button>
          </header>
          <p>{PIECES[selected].does}</p>
          {(selected === 'track' || selected === 'shaft' || selected === 'wiper') && (
            <p className="viewer-live">
              <span style={{ '--tint': TINT_TO_PIN1 } as CSSProperties}>Pin 1 to the wiper {ohms(legs[0])}</span>
              <span style={{ '--tint': TINT_TO_PIN3 } as CSSProperties}>Wiper to pin 3 {ohms(legs[1])}</span>
            </p>
          )}
          {(selected === 'end1' || selected === 'end3') && (
            <p className="viewer-live">{onEnd === selected ? 'The wiper is on it now: turning here changes nothing.' : 'Turn the shaft all the way to this end to put the wiper on it.'}</p>
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
          <p className="viewer-source">{PIECES[selected].source}</p>
          <button type="button" className="link" onClick={() => { toggleHidden(selected); }}>
            {hidden.has(selected) ? 'Show it' : 'Hide it'}
          </button>
        </section>
      )}

      <div className="viewer-foot">
        <div className="viewer-readout">
          <span>
            Turned {degrees}° of {KNOB_10K.turnDegrees}°
          </span>
          <span style={{ '--tint': TINT_TO_PIN1 } as CSSProperties}>pin 1 → wiper {ohms(legs[0])}</span>
          <span style={{ '--tint': TINT_TO_PIN3 } as CSSProperties}>wiper → pin 3 {ohms(legs[1])}</span>
        </div>
        <nav className="viewer-pieces" aria-label="Pieces">
          {PIECE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`chip${selected === id ? ' on' : ''}${hidden.has(id) ? ' off' : ''}`}
              aria-pressed={selected === id}
              onClick={() => { setSelected(selected === id ? undefined : id); }}
              onPointerEnter={() => { setHovered(id); }}
              onPointerLeave={() => { setHovered(undefined); }}
            >
              {PIECES[id].name}
            </button>
          ))}
        </nav>
        <p className="viewer-help">Drag the shaft to turn it · drag elsewhere to look around · scroll or pinch to zoom</p>
      </div>
    </div>
  );
}
