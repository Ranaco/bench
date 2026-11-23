import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../core/geometry';
import { materialFor, type FinishName } from '../core/materials';
import { kit, type Model3d } from '../core/model';
import type { PinDecl } from '../core/units';
import { BACK_ROW, BOARD, BOARD_PINS, FRONT_ROW, HEADER, INSIDE, MARGINS, MODULE, PARTS, PLACES } from './devkitc';
import { DK_PIECES, type DkPiece } from './pieces';

/**
 * The ESP32-DevKitC V4 as three.js meshes (docs/3d.md), one group per piece, sized from Espressif's drawings
 * (devkitc.ts). Taken apart, the module lifts off the board and its shield can off the module, showing the chip.
 */

export type DevKitCModel = Model3d<DkPiece>;

/** What each piece is made of: all stand-ins, apart from the measured metals. */
const MADE_OF: Readonly<Record<DkPiece, FinishName>> = {
  board: 'blackBody',
  frontHeader: 'blackBody',
  backHeader: 'blackBody',
  module: 'greyBody',
  can: 'tin',
  chip: 'blackBody',
  flash: 'blackBody',
  usb: 'steel',
  bridge: 'blackBody',
  regulator: 'blackBody',
  enButton: 'steel',
  bootButton: 'steel',
};

const P = BOARD.pitch.mm;
const BACK_Z = -BOARD.rows.mm;
/** The board's edges, in the model's frame: pin 1 at x = 0, the front row at z = 0. */
const EDGE = {
  antennaEnd: -MARGINS.antennaEnd.mm,
  usbEnd: 18 * P + BOARD.endMargin.mm,
  front: MARGINS.front.mm,
  back: BACK_Z - BOARD.sideMargin.mm,
};
const MID_Z = (EDGE.front + EDGE.back) / 2;
const BOARD_BOTTOM = HEADER.tall.mm;
const BOARD_TOP = BOARD_BOTTOM + BOARD.thick.mm;

/** The silkscreen: every pin's name beside it, as on the real board, plus EN and Boot by their buttons. */
function silkscreen(): THREE.CanvasTexture | undefined {
  if (typeof document === 'undefined') return undefined;
  const long = EDGE.usbEnd - EDGE.antennaEnd;
  const wide = EDGE.front - EDGE.back;
  const scale = 2048 / long;
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = Math.round(wide * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.fillStyle = '#262525'; // KiCad's "black body"
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#e4e3cf'; // KiCad's "white body", as print
  ctx.font = '600 50px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  // The canvas's top edge is the board's back edge; x runs from the antenna end.
  const at = (x: number, z: number) => [(x - EDGE.antennaEnd) * scale, (z - EDGE.back) * scale] as const;
  const write = (text: string, x: number, z: number, inward: 1 | -1) => {
    const [cx, cy] = at(x, z);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = inward > 0 ? 'left' : 'right';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  FRONT_ROW.forEach((name, i) => {
    write(name, i * P, -1.6, 1);
  });
  BACK_ROW.forEach((name, i) => {
    write(name, i * P, BACK_Z + 1.6, -1);
  });
  ctx.textAlign = 'center';
  ctx.font = '600 44px system-ui, sans-serif';
  // Beside each button, towards the middle of the board, as the drawing has them.
  const labelX = PLACES.buttonsX.mm - PARTS.buttonLong.mm / 2 - 1.1;
  const [enX, enY] = at(labelX, PLACES.enZ.mm);
  ctx.fillText('EN', enX, enY);
  const [bootX, bootY] = at(labelX, PLACES.bootZ.mm);
  ctx.fillText('Boot', bootX, bootY);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** A row of 19 header pins along x at `z`: the plastic strip, and the pins through it and the board. */
function header(z: number) {
  const plastic = box(19 * P, HEADER.tall.mm, P, 9 * P, HEADER.tall.mm / 2, z);
  const pin = HEADER.pin.mm;
  const from = -HEADER.below.mm;
  const to = BOARD_TOP + HEADER.above.mm;
  const pins = mergeGeometries(Array.from({ length: 19 }, (_, i) => box(pin, to - from, pin, i * P, (from + to) / 2, z)));
  return { plastic, pins };
}

export function buildDevKitC(): DevKitCModel {
  // Taken apart: the can lifts off the module, the module (with the chips under the can) off the board.
  const lift: Record<DkPiece, number> = {
    board: 0,
    frontHeader: 0,
    backHeader: 0,
    module: 4,
    can: 12,
    chip: 4,
    flash: 4,
    usb: 0,
    bridge: 0,
    regulator: 0,
    enButton: 0,
    bootButton: 0,
  };
  const k = kit(DK_PIECES, MADE_OF, lift);
  const { add } = k;

  // The board, with its silkscreen printed on top.
  const long = EDGE.usbEnd - EDGE.antennaEnd;
  const wide = EDGE.front - EDGE.back;
  add('board', box(long, BOARD.thick.mm, wide, (EDGE.antennaEnd + EDGE.usbEnd) / 2, (BOARD_BOTTOM + BOARD_TOP) / 2, MID_Z));
  const print = silkscreen();
  if (print) {
    const plane = new THREE.PlaneGeometry(long, wide);
    plane.rotateX(-Math.PI / 2);
    plane.translate((EDGE.antennaEnd + EDGE.usbEnd) / 2, BOARD_TOP + 0.005, MID_Z);
    add('board', plane, k.own(new THREE.MeshStandardMaterial({ map: k.own(print), roughness: 0.6, metalness: 0 })));
  }

  // The headers: plastic below the board, pins through both. The pins are tin, the plastic black.
  const pinMaterial = k.own(materialFor('tin'));
  for (const [id, z] of [
    ['frontHeader', 0],
    ['backHeader', BACK_Z],
  ] as const) {
    const { plastic, pins } = header(z);
    add(id, plastic);
    add(id, pins, pinMaterial);
  }

  // The module: its own board, from the antenna end past the board's edge, centred across it.
  const moduleStart = EDGE.antennaEnd - BOARD.overhang.mm;
  const moduleEnd = moduleStart + MODULE.long.mm;
  const moduleTop = BOARD_TOP + MODULE.pcb.mm;
  add('module', box(MODULE.long.mm, MODULE.pcb.mm, MODULE.wide.mm, (moduleStart + moduleEnd) / 2, BOARD_TOP + MODULE.pcb.mm / 2, MID_Z));
  // Its antenna: a zigzag of copper across the far end, drawn after the module datasheet's picture.
  const copper = k.own(materialFor('copper'));
  // Six runs across the module, 1 mm in from each side, joined end to end: drawn, not measured.
  const zig = 0.6;
  const runs = 6;
  const step = (MODULE.wide.mm - 2 - zig) / runs;
  const antennaX = moduleStart + MODULE.antenna.mm / 2;
  const first = MID_Z - MODULE.wide.mm / 2 + 1 + zig / 2;
  for (let i = 0; i < runs; i++) {
    const z = first + i * step;
    add('module', box(zig, 0.04, step + zig, antennaX + (i % 2 === 0 ? -1.8 : 1.8), moduleTop + 0.02, z + step / 2), copper);
    if (i < runs - 1) add('module', box(3.6 + zig, 0.04, zig, antennaX, moduleTop + 0.02, z + step), copper);
  }

  // The shield can, and under it the chip and its flash memory.
  const canEnd = moduleEnd - MODULE.canFromEnd.mm;
  const canStart = canEnd - MODULE.canLong.mm;
  const canTall = MODULE.tall.mm - MODULE.pcb.mm;
  const can = k.materials.can;
  can.side = THREE.DoubleSide;
  const canShell = new THREE.BoxGeometry(MODULE.canLong.mm, canTall, MODULE.canWide.mm);
  canShell.translate((canStart + canEnd) / 2, moduleTop + canTall / 2, MID_Z);
  add('can', canShell);
  const chip = INSIDE.chip.mm;
  add('chip', box(chip, INSIDE.chipTall.mm, chip, canStart + PLACES.chipIn.mm, moduleTop + INSIDE.chipTall.mm / 2, MID_Z + 1));
  add('flash', box(INSIDE.flashLong.mm, INSIDE.flashTall.mm, INSIDE.flashWide.mm, canStart + PLACES.flashIn.mm, moduleTop + INSIDE.flashTall.mm / 2, MID_Z - 2));

  // The parts at the USB end, where the drawing puts them.
  const usbOut = EDGE.usbEnd + PARTS.usbPast.mm;
  add('usb', box(PARTS.usbDeep.mm, PARTS.usbTall.mm, PARTS.usbWide.mm, usbOut - PARTS.usbDeep.mm / 2, BOARD_TOP + PARTS.usbTall.mm / 2, MID_Z));
  add('bridge', box(PARTS.bridge.mm, PARTS.bridgeTall.mm, PARTS.bridge.mm, PLACES.bridgeX.mm, BOARD_TOP + PARTS.bridgeTall.mm / 2, MID_Z));
  add('regulator', box(PARTS.regulatorWide.mm, PARTS.regulatorTall.mm, PARTS.regulatorLong.mm, PLACES.regulatorX.mm, BOARD_TOP + PARTS.regulatorTall.mm / 2, MID_Z));
  for (const [id, z] of [
    ['enButton', PLACES.enZ.mm],
    ['bootButton', PLACES.bootZ.mm],
  ] as const) {
    const x = PLACES.buttonsX.mm;
    add(id, box(PARTS.buttonLong.mm, PARTS.buttonTall.mm, PARTS.buttonWide.mm, x, BOARD_TOP + PARTS.buttonTall.mm / 2, z));
    // Its plunger: the black disc you press, drawn.
    const plunger = new THREE.CylinderGeometry(0.9, 0.9, 0.5, 24);
    plunger.translate(x, BOARD_TOP + PARTS.buttonTall.mm + 0.25, z);
    add(id, plunger, k.materials.board);
  }

  // Where each of Bench's board pins is, for labels: below its tip, and every other one of a row's (in order along
  // it) lower still, so the labels of neighbouring pins don't sit on each other.
  const anchors: Record<string, THREE.Object3D> = {};
  for (const row of ['front', 'back'] as const) {
    const along = Object.entries(BOARD_PINS)
      .filter(([, place]) => place.row === row)
      .sort(([, a], [, b]) => a.index - b.index);
    along.forEach(([id, { index }], rank) => {
      const below = -HEADER.below.mm - 1.4 - (rank % 2) * 3;
      anchors[id] = k.anchor(row === 'front' ? 'frontHeader' : 'backHeader', index * P, below, row === 'front' ? 0 : BACK_Z);
    });
  }
  anchors.usb = k.anchor('usb', usbOut + 1.5, BOARD_TOP + PARTS.usbTall.mm, MID_Z);

  const pins: PinDecl[] = [
    ...FRONT_ROW.map((name, i) => ({ id: `front${String(i + 1)}`, name, at: [i * P, 0, 0] as const, direction: [0, -1, 0] as const, widthMm: HEADER.pin.mm })),
    ...BACK_ROW.map((name, i) => ({ id: `back${String(i + 1)}`, name, at: [i * P, 0, BACK_Z] as const, direction: [0, -1, 0] as const, widthMm: HEADER.pin.mm })),
  ];
  return k.model([0, 0, 0], pins, anchors);
}
