import * as THREE from 'three';
import { box, extrudeUp } from '../core/geometry';
import type { FinishName } from '../core/materials';
import { kit, type Model3d } from '../core/model';
import { BACK_RADIUS, CASE, FLAT_AHEAD, INSIDE, LAYERS, SEATED } from './to92';
import { Q_PIECES, type QPiece } from './pieces';

/**
 * The PN2222A as three.js meshes (docs/3d.md), one group per piece, its case from onsemi's TO-92 drawing (to92.ts).
 * It comes apart (the body lifts off what it was moulded round), and can show its chip's layers, sketched beside it.
 */

export interface TransistorModel extends Model3d<QPiece> {
  /** Shows the chip's layers, sketched and magnified beside the body, or hides them. */
  setLayers(shown: boolean): void;
}

/** What each piece is made of (docs/3d.md §4): stand-ins, apart from the measured metals and silicon. */
const MADE_OF: Readonly<Record<QPiece, FinishName>> = {
  body: 'blackBody',
  emitterLeg: 'tin',
  baseLeg: 'tin',
  collectorLeg: 'tin',
  chip: 'silicon',
  emitterWire: 'gold',
  baseWire: 'gold',
  emitterLayer: 'nSilicon',
  baseLayer: 'pSilicon',
  collectorLayer: 'nSilicon',
};

/** The top mark on the flat face, as an sRGB texture: only where there's a page to draw it on. */
function topMark(): THREE.CanvasTexture | undefined {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.fillStyle = '#e4e3cf'; // KiCad's "white body", as print
  ctx.textAlign = 'center';
  ctx.font = '600 92px system-ui, sans-serif';
  ctx.fillText('PN2222A', 256, 150);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** A bond wire: a thin tube arching forward from `from` to `to`. */
function wire(from: THREE.Vector3, to: THREE.Vector3, bulge: number, radius: number): THREE.BufferGeometry {
  const middle = from.clone().lerp(to, 0.5);
  middle.z += bulge;
  middle.y += bulge * 0.4;
  const path = new THREE.QuadraticBezierCurve3(from, middle, to);
  return new THREE.TubeGeometry(path, 24, radius, 8, false);
}

export function buildTransistor(): TransistorModel {
  const pitch = CASE.pitch.mm;
  const R = BACK_RADIUS.mm;
  const flat = FLAT_AHEAD.mm;
  const H = CASE.height.mm;
  const legW = CASE.legWidth.mm;
  const legT = CASE.legThickness.mm;
  const floor = SEATED.mm;

  // Taken apart, the body lifts clear off the lead frame, chip and wires it was moulded round.
  const lift: Record<QPiece, number> = {
    body: H + 3,
    emitterLeg: 0,
    baseLeg: 0,
    collectorLeg: 0,
    chip: 0,
    emitterWire: 0,
    baseWire: 0,
    emitterLayer: 0,
    baseLayer: 0,
    collectorLayer: 0,
  };
  const k = kit(Q_PIECES, MADE_OF, lift);
  const { add } = k;

  // The body: a D, round at the back and cut flat at the front, pushed up from the board. In the shape's plane, its
  // y is the model's −z, so the flat front is at y = −flat and the round reaches round the back through +y. The
  // round's centre sits a hair behind the legs (0.015 mm), so its back lands on the printed distance from them.
  const centre = CASE.behindLegs.mm - R;
  const half = Math.sqrt(R * R - (flat + centre) ** 2);
  const start = Math.atan2(-flat - centre, half);
  const outline = new THREE.Shape();
  outline.moveTo(-half, -flat);
  outline.lineTo(half, -flat);
  outline.absarc(0, centre, R, start, Math.PI - start, false);
  outline.closePath();
  add('body', extrudeUp(outline, floor, H, INSIDE.bevel.mm));

  // The top mark, printed on the flat face.
  const mark = topMark();
  if (mark) {
    const print = k.own(new THREE.MeshStandardMaterial({ map: k.own(mark), transparent: true, roughness: 0.6, metalness: 0 }));
    const plane = new THREE.PlaneGeometry(2 * half * 0.86, (2 * half * 0.86) / 2);
    plane.translate(0, floor + H * 0.62, flat + 0.01);
    add('body', plane, print);
  }

  // The legs, a flat lead frame in the plane of the legs: emitter, base, collector, from the left. Each runs from its
  // tip, below the board, up into the body.
  const legsTop = floor + INSIDE.legTops.mm;
  const flagBottom = floor + INSIDE.flagBottom.mm;
  const flagTop = floor + INSIDE.flagTop.mm;
  const legLength = CASE.legLength.mm;
  add('emitterLeg', box(legW, legLength + legsTop - floor, legT, -pitch, (legsTop + floor - legLength) / 2, 0));
  add('baseLeg', box(legW, legLength + legsTop - floor, legT, 0, (legsTop + floor - legLength) / 2, 0));
  add('collectorLeg', box(legW, legLength + flagBottom - floor, legT, pitch, (flagBottom + floor - legLength) / 2, 0));
  // The collector's flag: wide enough to carry the chip above the other two legs' tops.
  const flagLeft = INSIDE.flagLeft.mm;
  const flagRight = pitch + legW / 2;
  add('collectorLeg', box(flagRight - flagLeft, flagTop - flagBottom, legT, (flagLeft + flagRight) / 2, (flagBottom + flagTop) / 2, 0));

  // The chip on the flag's front face, and its two wires down to the emitter's and base's tops.
  const chip = INSIDE.chip.mm;
  const chipT = INSIDE.chipThickness.mm;
  const chipX = (flagLeft + flagRight) / 2;
  const chipY = (flagBottom + flagTop) / 2;
  const face = legT / 2 + chipT;
  add('chip', box(chip, chip, chipT, chipX, chipY, legT / 2 + chipT / 2));
  const r = INSIDE.wire.mm / 2;
  add('emitterWire', wire(new THREE.Vector3(chipX - chip / 4, chipY + chip / 6, face), new THREE.Vector3(-pitch, legsTop - 0.15, legT / 2), 0.7, r));
  add('baseWire', wire(new THREE.Vector3(chipX + chip / 6, chipY - chip / 4, face), new THREE.Vector3(0, legsTop - 0.15, legT / 2), 0.5, r));

  // The chip's layers, sketched beside the body at the chip's height: collector at the bottom, a thin base, the
  // emitter in the middle of the base's top. Hidden until shown.
  const L = LAYERS;
  const x = R + L.aside.mm;
  const bottom = chipY - (L.collector.mm + L.base.mm + L.emitter.mm) / 2;
  add('collectorLayer', box(L.width.mm, L.collector.mm, L.deep.mm, x, bottom + L.collector.mm / 2, 0));
  add('baseLayer', box(L.width.mm, L.base.mm, L.deep.mm, x, bottom + L.collector.mm + L.base.mm / 2, 0));
  add('emitterLayer', box(L.emitterWidth.mm, L.emitter.mm, L.deep.mm * 0.7, x, bottom + L.collector.mm + L.base.mm + L.emitter.mm / 2, 0));

  const anchors = {
    emitter: k.anchor('emitterLeg', -pitch, floor - legLength - 1.2, 0),
    base: k.anchor('baseLeg', 0, floor - legLength - 1.2, 0),
    collector: k.anchor('collectorLeg', pitch, floor - legLength - 1.2, 0),
    // One label above the sketch, one beside it, one below: never on top of each other, however small it's drawn.
    emitterLayer: k.anchor('emitterLayer', x, bottom + L.collector.mm + L.base.mm + L.emitter.mm + 1, 0),
    baseLayer: k.anchor('baseLayer', x + L.width.mm / 2 + 2.2, bottom + L.collector.mm + L.base.mm / 2, 0),
    collectorLayer: k.anchor('collectorLayer', x, bottom - 1, 0),
  };

  const pin = (id: string, name: string, at: number) => ({
    id,
    name,
    at: [at, 0, 0] as const,
    direction: [0, -1, 0] as const,
    widthMm: legW,
  });
  // Pins where the legs leave the body: the drawing gives no height above a board (see SEATED).
  const pins = [pin('emitter', 'E', 0), pin('base', 'B', pitch), pin('collector', 'C', 2 * pitch)];
  const base = k.model([-pitch, floor, 0], pins, anchors);

  // Hidden, the sketch comes off the model altogether: an invisible object still counts in the box the view frames.
  const layerGroups = [k.groups.collectorLayer, k.groups.baseLayer, k.groups.emitterLayer];
  const holder = k.groups.body.parent;
  const setLayers = (shown: boolean) => {
    for (const group of layerGroups) {
      if (shown) holder?.add(group);
      else holder?.remove(group);
    }
  };
  setLayers(false);
  return { ...base, setLayers };
}
