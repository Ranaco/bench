import { UVR_25V } from '@bench/engine';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAPACITOR_VALUES } from '../../builder/catalog';
import { buildCapacitor } from './buildCapacitor';
import { CAP_INFO, CAP_PIECES } from './pieces';

const boxOfPiece = (root: THREE.Object3D, name: string) => {
  const piece = root.getObjectByName(name);
  if (!piece) throw new Error(`no ${name}`);
  root.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(piece);
};

describe('the capacitor in 3D', () => {
  it('is the size its datasheet row says, for every size', () => {
    for (const uf of CAPACITOR_VALUES) {
      const spec = UVR_25V[uf];
      const model = buildCapacitor(spec);
      const sleeve = boxOfPiece(model.root, 'sleeve');
      expect(sleeve.max.x - sleeve.min.x, `${String(uf)} µF across`).toBeCloseTo(spec.diameterMm, 2);
      const can = boxOfPiece(model.root, 'can');
      expect(can.max.y, `${String(uf)} µF long`).toBeCloseTo(spec.lengthMm, 6);
      expect(can.min.y).toBeCloseTo(0, 6); // it stands on the surface at y = 0
      model.dispose();
    }
  });

  it('puts pin 1, the + lead, at the origin and the − lead along +x, at the datasheet’s spacing', () => {
    for (const uf of CAPACITOR_VALUES) {
      const spec = UVR_25V[uf];
      const model = buildCapacitor(spec);
      expect(model.pins.map((p) => p.at)).toEqual([
        [0, 0, 0],
        [spec.leadSpacingMm, 0, 0],
      ]);
      const plus = boxOfPiece(model.root, 'plusLead');
      const minus = boxOfPiece(model.root, 'minusLead');
      expect((plus.min.x + plus.max.x) / 2).toBeCloseTo(0, 6);
      expect((minus.min.x + minus.max.x) / 2).toBeCloseTo(spec.leadSpacingMm, 6);
      expect(plus.max.x - plus.min.x).toBeCloseTo(spec.leadDiameterMm, 2);
      // "15 min." below the case, and the + lead "4 min." longer: the model uses the minimums.
      expect(minus.min.y).toBeCloseTo(-15, 6);
      expect(plus.min.y).toBeCloseTo(-19, 6);
      model.dispose();
    }
  });

  it('comes apart upwards, sleeve over can over roll, and unrolls its layers out of the roll', () => {
    const model = buildCapacitor(UVR_25V[1000]);
    model.setExplode(1);
    const y = (name: string) => model.root.getObjectByName(name)?.position.y ?? Number.NaN;
    expect(y('seal')).toBe(0);
    expect(y('roll')).toBeGreaterThan(0);
    expect(y('can')).toBeGreaterThan(y('roll'));
    expect(y('sleeve')).toBeGreaterThan(y('can'));
    const anode = model.root.getObjectByName('anode')?.children[0];
    expect(anode?.visible).toBe(false);
    model.setUnroll(1);
    expect(anode?.visible).toBe(true);
    expect(anode?.scale.x).toBeGreaterThan(UVR_25V[1000].diameterMm); // pulled out past the roll
    model.dispose();
  });

  it('has every piece, each explained', () => {
    const model = buildCapacitor(UVR_25V[220]);
    for (const id of CAP_PIECES) {
      expect(model.pickables.some((mesh) => model.pieceOf(mesh) === id), id).toBe(true);
      expect(CAP_INFO[id].does.length).toBeGreaterThan(20);
      expect(CAP_INFO[id].source.length).toBeGreaterThan(20);
    }
    model.dispose();
  });
});
