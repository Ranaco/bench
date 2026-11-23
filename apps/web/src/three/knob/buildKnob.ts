import * as THREE from 'three';
import { box, circle, cylinder, direction, extrudeUp, rect, ringArc } from '../core/geometry';
import type { FinishName } from '../core/materials';
import { kit, type Model3d } from '../core/model';
import { INSIDE, OUTSIDE, carbon, pieces, wiperAlong } from './knob3d';
import { PIECE_IDS, type PieceId } from './pieces';

/**
 * The knob as three.js meshes (docs/3d.md), one group per piece. Built with
 * the shaft on the y axis, then moved so pin 1 is the origin. Sizes come from
 * knob3d.ts.
 */

export interface KnobModel extends Model3d<PieceId> {
  setTurn(turn: number): void;
  /** Tints the two pieces of carbon the wiper splits the track into. */
  setTinted(on: boolean): void;
  /** The middle of the shaft (it moves with the shaft when the knob's taken apart): what a drag turns around. */
  readonly shaftCentre: THREE.Object3D;
}

/** How far each piece lifts when taken apart, in mm: the inside rises in layers, the cover goes to the top. */
export const LIFT: Readonly<Record<PieceId, number>> = {
  housing: 0,
  pin1: 0,
  pin2: 0,
  pin3: 0,
  board: 4,
  track: 4,
  end1: 4,
  end3: 4,
  ring: 4,
  wiper: 8.5,
  rotor: 13.5,
  shaft: 13.5,
  collar: 18,
  cover: 18,
};

/** What each piece is made of. The datasheet names none of these materials: they're stand-ins (docs/3d.md §4). */
const MADE_OF: Readonly<Record<PieceId, FinishName>> = {
  shaft: 'whiteBody',
  collar: 'greyBody',
  cover: 'steel',
  rotor: 'greyBody',
  wiper: 'bronze',
  track: 'carbon',
  end1: 'silver',
  end3: 'silver',
  ring: 'silver',
  board: 'phenolic',
  housing: 'blackBody',
  pin1: 'tin',
  pin2: 'tin',
  pin3: 'tin',
};

/** The pieces that turn with the shaft. */
const TURNING: readonly PieceId[] = ['shaft', 'rotor', 'wiper'];

export const TINT_TO_PIN1 = '#64d2ff';
export const TINT_TO_PIN3 = '#bf5af2';

const deg = (d: number) => (d * Math.PI) / 180;

export function buildKnob(): KnobModel {
  const o = OUTSIDE;
  const i = INSIDE;
  const k = kit(PIECE_IDS, MADE_OF, LIFT);
  const { add, groups, materials } = k;
  const halfW = o.bodyWidth.mm / 2;
  const front = o.depth.mm; // the top of the metal plate
  const wallTop = front - o.plate.mm;
  const boardTop = i.floor.mm + i.boardThickness.mm;
  const shaftR = o.shaftDiameter.mm / 2;
  const armY = boardTop + 0.45; // the wiper's arm, just above the print
  const rotorBottom = armY + 0.075; // the wiper is fixed straight under the rotor
  const rotorTop = rotorBottom + i.rotorThickness.mm;
  const flatStart = o.shaftLength.mm - o.flatLength.mm;

  // The flat prints on the track board sit a hair above it: keep them from flickering through it.
  for (const id of ['track', 'end1', 'end3', 'ring'] as const) {
    materials[id].polygonOffset = true;
    materials[id].polygonOffsetFactor = -1;
    materials[id].polygonOffsetUnits = -1;
    materials[id].side = THREE.DoubleSide;
  }

  // The body: a floor, walls round the inside, and the ledge the pins come out of.
  add('housing', box(o.bodyWidth.mm, i.floor.mm, o.axisToTop.mm + o.axisToBottom.mm, 0, i.floor.mm / 2, (o.axisToBottom.mm - o.axisToTop.mm) / 2));
  const walls = rect(halfW, o.axisToTop.mm);
  walls.holes.push(rect(halfW - i.wall.mm, o.axisToTop.mm - i.wall.mm));
  add('housing', extrudeUp(walls, i.floor.mm, wallTop - i.floor.mm));
  const ledgeHalf = o.pinPitch.mm + o.pinWidth.mm;
  add('housing', box(2 * ledgeHalf, o.pinsBend.mm + 0.4, o.ledge.mm, 0, (o.pinsBend.mm + 0.4) / 2, o.axisToBottom.mm + o.ledge.mm / 2));

  // The three pins: flat strips down the outside of the ledge, narrowing to fit their holes in the circuit board
  // below. Pin 1 on the left.
  const pinX = (n: number) => (n - 1) * o.pinPitch.mm;
  for (const [n, id] of (['pin1', 'pin2', 'pin3'] as const).entries()) {
    add(id, box(o.pinWidth.mm, o.pinsBend.mm, o.pinThickness.mm, pinX(n), o.pinsBend.mm / 2, o.axisToPins.mm));
    add(id, box(o.pinTipWidth.mm, o.pinsBelow.mm, o.pinThickness.mm, pinX(n), -o.pinsBelow.mm / 2, o.axisToPins.mm));
  }

  // The track board, and what's printed on it: the carbon, its silver ends and the ring for pin 2, joined to the pins.
  add('board', cylinder(i.boardRadius.mm, i.floor.mm, boardTop));
  const print = boardTop + 0.01;
  const { from, to } = carbon();
  const endWidth = 28; // degrees of silver past each end of the carbon
  add('track', ringArc(i.trackInner.mm, i.trackOuter.mm, from, to)).position.y = print;
  const traceTo = i.boardRadius.mm - 0.05;
  const mid = (i.trackInner.mm + i.trackOuter.mm) / 2;
  for (const [id, a, b, side] of [
    ['end1', from - endWidth, from, -1],
    ['end3', to, to + endWidth, 1],
  ] as const) {
    add(id, ringArc(i.trackInner.mm, i.trackOuter.mm, a, b)).position.y = print;
    const [dx, dz] = direction((a + b) / 2);
    const start = dz * mid;
    add(id, box(0.9, 0.02, traceTo - start, side * Math.abs(dx * mid), print, (start + traceTo) / 2));
  }
  add('ring', ringArc(i.ringInner.mm, i.ringOuter.mm, 0, 360)).position.y = print;
  add('ring', box(0.9, 0.02, traceTo - i.ringOuter.mm + 0.1, 0, print, (i.ringOuter.mm - 0.1 + traceTo) / 2));

  // Two arcs over the carbon, tinted, for the two pieces the wiper splits it into. Rebuilt as it turns.
  const tints = [TINT_TO_PIN1, TINT_TO_PIN3].map((color) => {
    const material = k.own(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -2;
    const mesh = add('track', new THREE.BufferGeometry(), material);
    mesh.position.y = print + 0.01;
    return mesh;
  });

  // The wiper, fixed under the rotor, pointing at 0° (the top) before it's turned: an arm with a finger on the
  // carbon and a finger on the ring.
  const ringMid = (i.ringInner.mm + i.ringOuter.mm) / 2;
  add('wiper', box(1, 0.15, mid + 0.4 - 0.5, 0, armY, -(mid + 0.4 + 0.5) / 2));
  const hub = new THREE.CylinderGeometry(1.2, 1.2, 0.15, 32);
  hub.translate(0, armY, 0);
  add('wiper', hub);
  for (const r of [mid, ringMid]) {
    const finger = new THREE.SphereGeometry(0.3, 16, 12);
    finger.translate(0, print + 0.3, -r);
    add('wiper', finger);
    add('wiper', box(0.35, armY - print - 0.3, 0.35, 0, (armY + print + 0.3) / 2, -r));
  }

  // The rotor, and the shaft above it: round up to the flat, then cut flat on the side away from the wiper.
  add('rotor', cylinder(i.rotorRadius.mm, rotorBottom, rotorTop));
  add('shaft', cylinder(shaftR, rotorTop, flatStart));
  // The flat sits this far from the centre. In extrudeUp the shape's −y becomes +z, so cutting the shape at −y puts
  // the flat facing +z: opposite the wiper, as the drawing has it.
  const across = o.flatLeaves.mm - shaftR;
  const cut = Math.asin(across / shaftR);
  const d = new THREE.Shape();
  d.absarc(0, 0, shaftR, -cut, Math.PI + cut, false);
  d.closePath();
  add('shaft', extrudeUp(d, flatStart, o.shaftLength.mm - flatStart, 0.35));

  // The collar the shaft comes out of, and the metal cover: a plate with a hole, two rivets, and two ears down its
  // sides whose legs, rounded at the tip, go on into the circuit board.
  const collar = new THREE.Shape();
  collar.absarc(0, 0, o.collarDiameter.mm / 2, 0, Math.PI * 2, false);
  collar.holes.push(circle(shaftR + 0.05));
  add('collar', extrudeUp(collar, front, o.collar.mm));
  const plate = rect(halfW, o.axisToTop.mm);
  plate.holes.push(circle(o.collarDiameter.mm / 2 - 0.2));
  add('cover', extrudeUp(plate, wallTop, o.plate.mm));
  const earThickness = o.earsAcross.mm / 2 - halfW;
  const earX = halfW + earThickness / 2;
  const earR = o.earWidth.mm / 2;
  const legBottom = -o.earsBelow.mm + earR;
  for (const side of [-1, 1]) {
    add('cover', box(earThickness, front - legBottom, o.earWidth.mm, side * earX, (front + legBottom) / 2, 0));
    const tip = new THREE.CylinderGeometry(earR, earR, earThickness, 32, 1, false, Math.PI, Math.PI); // the lower half, once it lies along x
    tip.rotateZ(Math.PI / 2);
    tip.translate(side * earX, legBottom, 0);
    add('cover', tip);
  }
  for (const [x, z] of [
    [-3.1, -4.3],
    [3.1, 4.3],
  ] as const) {
    add('cover', cylinder(0.5, front, front + 0.15, x, z));
  }

  // Points to hang labels on: below each pin's tip, and beside the middle of each piece of track.
  const below = -o.pinsBelow.mm - 0.6;
  const anchors = {
    pin1: k.anchor('pin1', pinX(0), below, o.axisToPins.mm),
    pin2: k.anchor('pin2', pinX(1), below, o.axisToPins.mm),
    pin3: k.anchor('pin3', pinX(2), below, o.axisToPins.mm),
    toPin1: k.anchor('track', 0, print, 0),
    toPin3: k.anchor('track', 0, print, 0),
  };

  // Where each pin goes into the board: the bottom of its body, on the surface the part sits on.
  const pins = (['pin1', 'pin2', 'pin3'] as const).map((id, n) => ({
    id,
    name: `pin ${String(n + 1)}`,
    at: [pinX(n) - pinX(0), 0, 0] as const,
    direction: [0, -1, 0] as const,
    widthMm: o.pinTipWidth.mm,
  }));
  const base = k.model([pinX(0), 0, o.axisToPins.mm], pins, anchors);

  let current = { turn: 0.5, hidden: new Set<PieceId>() as ReadonlySet<PieceId>, tinted: true };
  const placeTints = () => {
    const split = pieces(current.turn);
    for (const [n, [a, b]] of [split.toPin1, split.toPin3].entries()) {
      const mesh = tints[n];
      mesh.geometry.dispose();
      mesh.geometry = ringArc(i.trackInner.mm, i.trackOuter.mm, a, b);
      mesh.visible = current.tinted && b - a > 0.5 && !current.hidden.has('track');
      const [x, z] = direction((a + b) / 2);
      (n === 0 ? anchors.toPin1 : anchors.toPin3).position.set(x * (i.trackOuter.mm + 1.6), print, z * (i.trackOuter.mm + 1.6));
    }
  };

  const model: KnobModel = {
    ...base,
    shaftCentre: k.anchor('shaft', 0, (rotorTop + o.shaftLength.mm) / 2, 0),
    setTurn(turn) {
      current = { ...current, turn };
      const spin = -deg(wiperAlong(turn));
      for (const id of TURNING) groups[id].rotation.y = spin;
      placeTints();
    },
    setHidden(hidden) {
      current = { ...current, hidden };
      base.setHidden(hidden);
      placeTints();
    },
    setTinted(on) {
      current = { ...current, tinted: on };
      placeTints();
    },
    dispose() {
      for (const t of tints) t.geometry.dispose();
      base.dispose();
    },
  };
  model.setTurn(0.5);
  return model;
}
