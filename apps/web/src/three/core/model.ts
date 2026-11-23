import * as THREE from 'three';
import { materialFor, type FinishName } from './materials';
import type { PinDecl } from './units';

/** A piece's card: what it's called, what it does, and where its shape comes from. */
export interface PieceInfo {
  readonly name: string;
  readonly does: string;
  readonly source: string;
}

/**
 * A part in 3D (docs/3d.md §3): one group per piece, in millimetres, with pin 1
 * at the origin on the surface it sits on. The viewer scales it to metres.
 */
export interface Model3d<P extends string = string> {
  readonly root: THREE.Group;
  readonly pieces: readonly P[];
  /** Every mesh you can point at. */
  readonly pickables: readonly THREE.Mesh[];
  /** Which piece a mesh belongs to. */
  pieceOf(object: THREE.Object3D): P | undefined;
  /** Points to hang labels on, by name. */
  readonly anchors: Readonly<Record<string, THREE.Object3D>>;
  readonly pins: readonly PinDecl[];
  /** 0 is put together; 1 has each piece lifted clear of the one below. */
  setExplode(amount: number): void;
  setHidden(hidden: ReadonlySet<P>): void;
  setHighlight(hovered: P | undefined, selected: P | undefined): void;
  dispose(): void;
}

/** The glow on the piece you've picked (stronger) or are pointing at. */
const HIGHLIGHT = '#3f7cff';

/**
 * What every model shares: a group per piece, a material per piece, picking,
 * lifting apart, hiding and lighting up. A builder adds its geometry with
 * `add`, then calls `model` to finish.
 */
export function kit<P extends string>(pieces: readonly P[], finishes: Readonly<Record<P, FinishName>>, lift: Readonly<Record<P, number>>) {
  const root = new THREE.Group();
  /** The model in its builder's own frame: moved so that pin 1 lands on the root's origin. */
  const frame = new THREE.Group();
  root.add(frame);
  const groups = {} as Record<P, THREE.Group>;
  const materials = {} as Record<P, THREE.MeshStandardMaterial>;
  const owner = new Map<THREE.Object3D, P>();
  const pickables: THREE.Mesh[] = [];
  const disposables: { dispose(): void }[] = [];

  for (const id of pieces) {
    const group = new THREE.Group();
    group.name = id;
    frame.add(group);
    groups[id] = group;
    const material = materialFor(finishes[id], { emissive: HIGHLIGHT, emissiveIntensity: 0 });
    materials[id] = material;
    disposables.push(material);
  }

  /** A mesh for a piece, in its material unless others are given (an array: one per geometry group). */
  const add = (id: P, geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[] = materials[id]) => {
    const mesh = new THREE.Mesh(geometry, material);
    owner.set(mesh, id);
    groups[id].add(mesh);
    pickables.push(mesh);
    disposables.push(geometry);
    return mesh;
  };

  /** A point to hang a label on, inside a piece's group, so it moves with it. */
  const anchor = (id: P, x: number, y: number, z: number) => {
    const point = new THREE.Object3D();
    point.position.set(x, y, z);
    groups[id].add(point);
    return point;
  };

  /** Anything else the model made that needs freeing: materials of its own, textures. */
  const own = <T extends { dispose(): void }>(thing: T) => {
    disposables.push(thing);
    return thing;
  };

  /** Finishes the model: `pin1` is where pin 1 is in the builder's frame, and becomes the origin. */
  const model = (pin1: readonly [number, number, number], pins: readonly PinDecl[], anchors: Record<string, THREE.Object3D>): Model3d<P> => {
    frame.position.set(-pin1[0], -pin1[1], -pin1[2]);
    return {
      root,
      pieces,
      pickables,
      pieceOf: (object) => owner.get(object),
      anchors,
      pins,
      setExplode(amount) {
        for (const id of pieces) groups[id].position.y = lift[id] * amount;
      },
      setHidden(hidden) {
        for (const id of pieces) groups[id].visible = !hidden.has(id);
      },
      setHighlight(hovered, selected) {
        for (const id of pieces) materials[id].emissiveIntensity = id === selected ? 0.32 : id === hovered ? 0.16 : 0;
      },
      dispose() {
        for (const d of disposables) d.dispose();
      },
    };
  };

  return { root, groups, materials, owner, pickables, add, anchor, own, model };
}

/** The whole model's box in world units, as it stands. */
export function boxOf(model: Model3d): THREE.Box3 {
  model.root.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(model.root);
}
