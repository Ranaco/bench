import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { boxOf } from '../core/model';
import { buildTransistor } from './buildTransistor';
import { Q_INFO, Q_PIECES } from './pieces';
import { CASE } from './to92';

const boxOfPiece = (root: THREE.Object3D, name: string) => {
  const piece = root.getObjectByName(name);
  if (!piece) throw new Error(`no ${name}`);
  root.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(piece);
};

describe('the transistor in 3D', () => {
  it('is the size onsemi’s TO-92 drawing prints, the middle of each range', () => {
    const model = buildTransistor();
    const body = boxOfPiece(model.root, 'body');
    expect(body.max.x - body.min.x, 'across').toBeCloseTo(CASE.width.mm, 2); // the round is drawn in 48 flat steps
    expect(body.max.y - body.min.y, 'tall').toBeCloseTo(CASE.height.mm, 6);
    expect(body.min.y).toBeCloseTo(0, 6); // sitting on the board
    expect(body.max.z - body.min.z, 'flat face to the back').toBeCloseTo(CASE.depth.mm, 2);
    expect(-body.min.z, 'legs to the back of the round').toBeCloseTo(CASE.behindLegs.mm, 2);
    model.dispose();
  });

  it('puts leg 1, the emitter, at the origin, and base and collector along +x, 1.27 mm apart', () => {
    const model = buildTransistor();
    expect(model.pins.map((p) => [p.id, ...p.at])).toEqual([
      ['emitter', 0, 0, 0],
      ['base', 1.27, 0, 0],
      ['collector', 2.54, 0, 0],
    ]);
    for (const [name, x] of [
      ['emitterLeg', 0],
      ['baseLeg', 1.27],
    ] as const) {
      const leg = boxOfPiece(model.root, name);
      expect((leg.min.x + leg.max.x) / 2, name).toBeCloseTo(x, 6);
      expect(leg.max.x - leg.min.x, `${name} across`).toBeCloseTo(CASE.legWidth.mm, 6);
      expect(leg.max.z - leg.min.z, `${name} thick`).toBeCloseTo(CASE.legThickness.mm, 6);
      expect(leg.min.y, `${name} tip`).toBeCloseTo(-CASE.legLength.mm, 6);
    }
    // The collector's leg widens into its flag inside the body; below the body it's a leg like the others.
    expect(boxOfPiece(model.root, 'collectorLeg').min.y).toBeCloseTo(-CASE.legLength.mm, 6);
    model.dispose();
  });

  it('keeps everything inside the body inside it: lead frame, chip and wires', () => {
    const model = buildTransistor();
    const body = boxOfPiece(model.root, 'body');
    for (const name of ['chip', 'emitterWire', 'baseWire']) {
      const inside = boxOfPiece(model.root, name);
      expect(body.containsBox(inside), name).toBe(true);
    }
    model.dispose();
  });

  it('comes apart by lifting the body off what it was moulded round', () => {
    const model = buildTransistor();
    model.setExplode(1);
    const y = (name: string) => model.root.getObjectByName(name)?.position.y ?? Number.NaN;
    expect(y('body')).toBeGreaterThan(CASE.height.mm);
    for (const name of ['emitterLeg', 'baseLeg', 'collectorLeg', 'chip', 'emitterWire', 'baseWire']) expect(y(name), name).toBe(0);
    model.dispose();
  });

  it('shows its chip’s layers beside it only when asked, and frames without them otherwise', () => {
    const model = buildTransistor();
    const without = boxOf(model);
    expect(model.root.getObjectByName('baseLayer')).toBeUndefined();
    model.setLayers(true);
    expect(model.root.getObjectByName('baseLayer')).toBeDefined();
    const withLayers = boxOf(model);
    expect(withLayers.max.x).toBeGreaterThan(without.max.x);
    // Collector at the bottom, then the base, then the emitter on top.
    const bottom = (name: string) => boxOfPiece(model.root, name).min.y;
    expect(bottom('baseLayer')).toBeGreaterThan(bottom('collectorLayer'));
    expect(bottom('emitterLayer')).toBeGreaterThan(bottom('baseLayer'));
    model.setLayers(false);
    expect(boxOf(model).max.x).toBeCloseTo(without.max.x, 9);
    model.dispose();
  });

  it('has every piece, each explained', () => {
    const model = buildTransistor();
    for (const id of Q_PIECES) {
      expect(model.pickables.some((mesh) => model.pieceOf(mesh) === id), id).toBe(true);
      expect(Q_INFO[id].does.length, id).toBeGreaterThan(20);
      expect(Q_INFO[id].source.length, id).toBeGreaterThan(20);
    }
    model.dispose();
  });
});
