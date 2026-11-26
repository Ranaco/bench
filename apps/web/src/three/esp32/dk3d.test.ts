import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ESP32_PINS } from '../../kinds/esp32/board';
import { buildDevKitC } from './buildDevKitC';
import { BACK_ROW, BOARD, BOARD_PINS, FRONT_ROW, MODULE } from './devkitc';
import { DK_INFO, DK_PIECES } from './pieces';

const boxOfPiece = (root: THREE.Object3D, name: string) => {
  const piece = root.getObjectByName(name);
  if (!piece) throw new Error(`no ${name}`);
  root.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(piece);
};

describe('the ESP32-DevKitC in 3D', () => {
  it('is the size Espressif’s drawing prints, and its module the size its datasheet does', () => {
    const model = buildDevKitC();
    const board = boxOfPiece(model.root, 'board');
    expect(board.max.x - board.min.x, 'long').toBeCloseTo(BOARD.long.mm, 4); // geometry is stored in 32-bit floats
    expect(board.max.z - board.min.z, 'across').toBeCloseTo(BOARD.wide.mm, 4);
    const module = boxOfPiece(model.root, 'module');
    expect(module.max.x - module.min.x).toBeCloseTo(MODULE.long.mm, 4);
    expect(module.max.z - module.min.z).toBeCloseTo(MODULE.wide.mm, 4);
    // Its antenna hangs 6.04 mm past the board's end.
    expect(board.min.x - module.min.x).toBeCloseTo(BOARD.overhang.mm, 4);
    // Shield and all, 3.1 mm tall above the board.
    const can = boxOfPiece(model.root, 'can');
    expect(can.max.y - board.max.y).toBeCloseTo(MODULE.tall.mm, 4);
    model.dispose();
  });

  it('has 38 pins, 2.54 mm apart in two rows 25.40 mm apart, pin 1 (3V3) at the origin', () => {
    const model = buildDevKitC();
    expect(model.pins).toHaveLength(38);
    expect(model.pins[0]).toMatchObject({ name: '3V3', at: [0, 0, 0] });
    expect(model.pins[1]?.at[0]).toBeCloseTo(2.54, 9);
    expect(model.pins[18]).toMatchObject({ name: '5V' });
    expect(model.pins[18]?.at[0]).toBeCloseTo(18 * 2.54, 9);
    expect(model.pins[19]).toMatchObject({ name: 'GND' });
    expect(model.pins[19]?.at[2]).toBeCloseTo(-25.4, 9);
    model.dispose();
  });

  it('puts each of Bench’s board pins on the real pin of the same name', () => {
    for (const pin of ESP32_PINS) {
      expect(Object.hasOwn(BOARD_PINS, pin.id), pin.id).toBe(true);
      const place = BOARD_PINS[pin.id];
      const silkscreen = (place.row === 'front' ? FRONT_ROW : BACK_ROW)[place.index];
      expect(silkscreen, pin.id).toBe(pin.name.replace('GPIO', ''));
    }
  });

  it('comes apart: the module off the board, its can off the module, the chip with the module', () => {
    const model = buildDevKitC();
    model.setExplode(1);
    const y = (name: string) => model.root.getObjectByName(name)?.position.y ?? Number.NaN;
    expect(y('board')).toBe(0);
    expect(y('module')).toBeGreaterThan(0);
    expect(y('chip')).toBe(y('module'));
    expect(y('can')).toBeGreaterThan(y('module') + MODULE.tall.mm);
    model.dispose();
  });

  it('has every piece, each explained', () => {
    const model = buildDevKitC();
    for (const id of DK_PIECES) {
      expect(model.pickables.some((mesh) => model.pieceOf(mesh) === id), id).toBe(true);
      expect(DK_INFO[id].does.length, id).toBeGreaterThan(20);
      expect(DK_INFO[id].source.length, id).toBeGreaterThan(20);
    }
    model.dispose();
  });
});
