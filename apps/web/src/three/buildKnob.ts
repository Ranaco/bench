import * as THREE from 'three';
import { INSIDE, OUTSIDE, carbon, direction, pieces, wiperAlong } from './knob3d';
import { PIECE_IDS, type PieceId } from './pieces';

/**
 * The knob as three.js meshes, one group per piece, so each can be picked,
 * hidden, lit up and lifted away from the rest. Sizes come from knob3d.ts.
 */

export interface KnobModel {
  readonly root: THREE.Group;
  /** Every mesh you can point at. */
  readonly pickables: readonly THREE.Mesh[];
  /** Which piece a mesh belongs to. */
  pieceOf(object: THREE.Object3D): PieceId | undefined;
  /** Where to pin a label for each pin (its tip), and for each piece of the track (beside its middle). */
  readonly anchors: Readonly<Record<'pin1' | 'pin2' | 'pin3' | 'toPin1' | 'toPin3', THREE.Object3D>>;
  /** The middle of the shaft (it moves with the shaft when the knob's taken apart): what a drag turns around. */
  readonly shaftCentre: THREE.Object3D;
  setTurn(turn: number): void;
  /** 0 is put together; 1 has each piece lifted clear of the one below. */
  setExplode(amount: number): void;
  setHidden(hidden: ReadonlySet<PieceId>): void;
  setHighlight(hovered: PieceId | undefined, selected: PieceId | undefined): void;
  /** Tints the two pieces of carbon the wiper splits the track into. */
  setTinted(on: boolean): void;
  dispose(): void;
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

/** The pieces that turn with the shaft. */
const TURNING: ReadonlySet<PieceId> = new Set(['shaft', 'rotor', 'wiper']);

export const TINT_TO_PIN1 = '#64d2ff';
/** The glow on the piece you've picked (stronger) or are pointing at. */
const HIGHLIGHT = '#3f7cff';
export const TINT_TO_PIN3 = '#bf5af2';

const deg = (d: number) => (d * Math.PI) / 180;

/** Finishes, by what each piece is made of (the colours are illustrative: the datasheet doesn't say). */
const FINISH = {
  plastic: { color: '#1f1f22', roughness: 0.62, metalness: 0 },
  shaft: { color: '#b4b4b9', roughness: 0.5, metalness: 0 },
  rotor: { color: '#2e2e32', roughness: 0.55, metalness: 0 },
  steel: { color: '#a4a6ac', roughness: 0.24, metalness: 1 },
  tin: { color: '#c6c6cb', roughness: 0.2, metalness: 1 },
  bronze: { color: '#caa26c', roughness: 0.3, metalness: 1 },
  carbon: { color: '#151515', roughness: 0.9, metalness: 0 },
  silver: { color: '#dcdce0', roughness: 0.3, metalness: 0.9 },
  board: { color: '#6e4b2c', roughness: 0.75, metalness: 0 },
} as const;

const MADE_OF: Readonly<Record<PieceId, keyof typeof FINISH>> = {
  shaft: 'shaft',
  collar: 'rotor',
  cover: 'steel',
  rotor: 'rotor',
  wiper: 'bronze',
  track: 'carbon',
  end1: 'silver',
  end3: 'silver',
  ring: 'silver',
  board: 'board',
  housing: 'plastic',
  pin1: 'tin',
  pin2: 'tin',
  pin3: 'tin',
};

/** Arc of a flat ring lying face up at height y, between two angles clockwise from the top (degrees). */
function ringArc(inner: number, outer: number, from: number, to: number): THREE.BufferGeometry {
  const span = Math.max(to - from, 0.001);
  const geometry = new THREE.RingGeometry(inner, outer, Math.max(8, Math.ceil(span / 3)), 1, deg(90 - to), deg(span));
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** A shape pushed up from height `y0` by `height`: the shape's x is the model's x, its y the model's −z. */
function extrudeUp(shape: THREE.Shape, y0: number, height: number, bevel = 0): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height - 2 * bevel,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelOffset: -bevel, // round the edges inwards, so the outline keeps its size
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 48,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y0 + bevel, 0);
  return geometry;
}

function rect(halfX: number, halfY: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-halfX, -halfY);
  s.lineTo(halfX, -halfY);
  s.lineTo(halfX, halfY);
  s.lineTo(-halfX, halfY);
  s.closePath();
  return s;
}

function circle(radius: number): THREE.Path {
  const p = new THREE.Path();
  p.absarc(0, 0, radius, 0, Math.PI * 2, false);
  return p;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(x, y, z);
  return geometry;
}

function cylinder(radius: number, y0: number, y1: number, x = 0, z = 0): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(radius, radius, y1 - y0, 48);
  geometry.translate(x, (y0 + y1) / 2, z);
  return geometry;
}

export function buildKnob(): KnobModel {
  const o = OUTSIDE;
  const i = INSIDE;
  const halfW = o.bodyWidth.mm / 2;
  const front = o.depth.mm; // the top of the metal plate
  const wallTop = front - o.plate.mm;
  const boardTop = i.floor.mm + i.boardThickness.mm;
  const shaftR = o.shaftDiameter.mm / 2;
  const armY = boardTop + 0.45; // the wiper's arm, just above the print
  const rotorBottom = armY + 0.075; // the wiper is fixed straight under the rotor
  const rotorTop = rotorBottom + i.rotorThickness.mm;
  const flatStart = o.shaftLength.mm - o.flatLength.mm;

  const root = new THREE.Group();
  root.name = 'knob';
  const groups = {} as Record<PieceId, THREE.Group>;
  const materials = {} as Record<PieceId, THREE.MeshStandardMaterial>;
  const pickables: THREE.Mesh[] = [];
  const owner = new Map<THREE.Object3D, PieceId>();
  const disposables: { dispose(): void }[] = [];

  for (const id of PIECE_IDS) {
    const group = new THREE.Group();
    group.name = id;
    root.add(group);
    groups[id] = group;
    const material = new THREE.MeshStandardMaterial({ ...FINISH[MADE_OF[id]], emissive: HIGHLIGHT, emissiveIntensity: 0 });
    // The flat prints on the track board sit a hair above it: keep them from flickering through it.
    if (id === 'track' || id === 'end1' || id === 'end3' || id === 'ring') {
      material.polygonOffset = true;
      material.polygonOffsetFactor = -1;
      material.polygonOffsetUnits = -1;
      material.side = THREE.DoubleSide;
    }
    materials[id] = material;
    disposables.push(material);
  }

  const add = (id: PieceId, geometry: THREE.BufferGeometry) => {
    const mesh = new THREE.Mesh(geometry, materials[id]);
    owner.set(mesh, id);
    groups[id].add(mesh);
    pickables.push(mesh);
    disposables.push(geometry);
    return mesh;
  };

  // The body: a floor, walls round the inside, and the ledge the pins come out of.
  add('housing', box(o.bodyWidth.mm, i.floor.mm, o.axisToTop.mm + o.axisToBottom.mm, 0, i.floor.mm / 2, (o.axisToBottom.mm - o.axisToTop.mm) / 2));
  const walls = rect(halfW, o.axisToTop.mm);
  walls.holes.push(rect(halfW - i.wall.mm, o.axisToTop.mm - i.wall.mm));
  add('housing', extrudeUp(walls, i.floor.mm, wallTop - i.floor.mm));
  const ledgeHalf = o.pinPitch.mm + o.pinWidth.mm;
  add('housing', box(2 * ledgeHalf, o.pinsBend.mm + 0.4, o.ledge.mm, 0, (o.pinsBend.mm + 0.4) / 2, o.axisToBottom.mm + o.ledge.mm / 2));

  // The three pins: flat strips down the outside of the ledge, narrowing to fit their holes in the circuit board
  // below. Pin 1 on the left.
  for (const [k, id] of (['pin1', 'pin2', 'pin3'] as const).entries()) {
    const x = (k - 1) * o.pinPitch.mm;
    add(id, box(o.pinWidth.mm, o.pinsBend.mm, o.pinThickness.mm, x, o.pinsBend.mm / 2, o.axisToPins.mm));
    add(id, box(o.pinTipWidth.mm, o.pinsBelow.mm, o.pinThickness.mm, x, -o.pinsBelow.mm / 2, o.axisToPins.mm));
  }

  // The track board, and what's printed on it: the carbon, its silver ends and the ring for pin 2, joined to the pins.
  add('board', cylinder(i.boardRadius.mm, i.floor.mm, boardTop));
  const print = boardTop + 0.01;
  const { from, to } = carbon();
  const endWidth = 28; // degrees of silver past each end of the carbon
  const track = add('track', ringArc(i.trackInner.mm, i.trackOuter.mm, from, to));
  track.position.y = print;
  const traceTo = i.boardRadius.mm - 0.05;
  for (const [id, a, b, side] of [
    ['end1', from - endWidth, from, -1],
    ['end3', to, to + endWidth, 1],
  ] as const) {
    const pad = add(id, ringArc(i.trackInner.mm, i.trackOuter.mm, a, b));
    pad.position.y = print;
    const [dx, dz] = direction((a + b) / 2);
    const mid = (i.trackInner.mm + i.trackOuter.mm) / 2;
    const start = dz * mid;
    add(id, box(0.9, 0.02, traceTo - start, side * Math.abs(dx * mid), print, (start + traceTo) / 2));
  }
  const ring = add('ring', ringArc(i.ringInner.mm, i.ringOuter.mm, 0, 360));
  ring.position.y = print;
  add('ring', box(0.9, 0.02, traceTo - i.ringOuter.mm + 0.1, 0, print, (i.ringOuter.mm - 0.1 + traceTo) / 2));

  // Two arcs over the carbon, tinted, for the two pieces the wiper splits it into. Rebuilt as it turns.
  const tints = [TINT_TO_PIN1, TINT_TO_PIN3].map((color) => {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -2;
    disposables.push(material);
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    mesh.position.y = print + 0.01;
    owner.set(mesh, 'track');
    groups.track.add(mesh);
    pickables.push(mesh);
    return mesh;
  });

  // The wiper, fixed under the rotor, pointing at 0° (the top) before it's turned: an arm with a finger on the
  // carbon and a finger on the ring.
  const mid =(i.trackInner.mm + i.trackOuter.mm) / 2;
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

  // Points to hang labels on.
  const anchor = (parent: THREE.Object3D, x: number, y: number, z: number) => {
    const a = new THREE.Object3D();
    a.position.set(x, y, z);
    parent.add(a);
    return a;
  };
  const anchors = {
    pin1: anchor(groups.pin1, -o.pinPitch.mm, -o.pinsBelow.mm - 0.6, o.axisToPins.mm),
    pin2: anchor(groups.pin2, 0, -o.pinsBelow.mm - 0.6, o.axisToPins.mm),
    pin3: anchor(groups.pin3, o.pinPitch.mm, -o.pinsBelow.mm - 0.6, o.axisToPins.mm),
    toPin1: anchor(groups.track, 0, print, 0),
    toPin3: anchor(groups.track, 0, print, 0),
  };

  let current = { turn: 0.5, explode: 0, hidden: new Set<PieceId>() as ReadonlySet<PieceId>, tinted: true };

  const placeTints = () => {
    const split = pieces(current.turn);
    for (const [k, [a, b]] of [split.toPin1, split.toPin3].entries()) {
      const mesh = tints[k];
      mesh.geometry.dispose();
      mesh.geometry = ringArc(i.trackInner.mm, i.trackOuter.mm, a, b);
      mesh.visible = current.tinted && b - a > 0.5 && !current.hidden.has('track');
      const [x, z] = direction((a + b) / 2);
      const at = k === 0 ? anchors.toPin1 : anchors.toPin3;
      at.position.set(x * (i.trackOuter.mm + 1.6), print, z * (i.trackOuter.mm + 1.6));
    }
  };

  const model: KnobModel = {
    root,
    pickables,
    pieceOf: (object) => owner.get(object),
    anchors,
    shaftCentre: anchor(groups.shaft, 0, (rotorTop + o.shaftLength.mm) / 2, 0),
    setTurn(turn) {
      current = { ...current, turn };
      const spin = -deg(wiperAlong(turn));
      for (const id of TURNING) groups[id].rotation.y = spin;
      placeTints();
    },
    setExplode(amount) {
      current = { ...current, explode: amount };
      for (const id of PIECE_IDS) groups[id].position.y = LIFT[id] * amount;
    },
    setHidden(hidden) {
      current = { ...current, hidden };
      for (const id of PIECE_IDS) groups[id].visible = !hidden.has(id);
      placeTints();
    },
    setHighlight(hovered, selected) {
      for (const id of PIECE_IDS) {
        materials[id].emissiveIntensity = id === selected ? 0.5 : id === hovered ? 0.25 : 0;
      }
    },
    setTinted(on) {
      current = { ...current, tinted: on };
      placeTints();
    },
    dispose() {
      for (const t of tints) t.geometry.dispose();
      for (const d of disposables) d.dispose();
    },
  };
  model.setTurn(0.5);
  return model;
}
