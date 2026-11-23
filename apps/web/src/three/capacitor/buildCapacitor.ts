import type { ElectrolyticSpec } from '@bench/engine';
import * as THREE from 'three';
import { box, cylinder } from '../core/geometry';
import { materialFor, type FinishName } from '../core/materials';
import { kit, type Model3d } from '../core/model';
import { INSIDE, LAYERS, UNROLL_DIAMETERS, outside } from './cap3d';
import { CAP_PIECES, type CapPiece } from './pieces';

/**
 * A radial electrolytic as three.js meshes (docs/3d.md), one group per piece,
 * every size from its datasheet row (cap3d.ts). It can be taken apart, and
 * its roll unrolled to show the foils and paper inside.
 */

export interface CapacitorModel extends Model3d<CapPiece> {
  /** 0 is rolled up; 1 has the layers pulled out beside the roll. */
  setUnroll(amount: number): void;
}

/** What each piece is made of (docs/3d.md §4): stand-ins, apart from the measured metals. */
const MADE_OF: Readonly<Record<CapPiece, FinishName>> = {
  sleeve: 'blackBody',
  can: 'aluminium',
  vent: 'greyBody',
  roll: 'paper',
  anode: 'aluminium',
  paper: 'paper',
  cathode: 'steel',
  plusTab: 'aluminium',
  minusTab: 'aluminium',
  seal: 'rubber',
  plusLead: 'tin',
  minusLead: 'tin',
};

/** Print on the sleeve, and the − stripe, as an sRGB texture: only where there's a page to draw it on. */
function sleevePrint(microfarads: number, volts: number): THREE.CanvasTexture | undefined {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.fillStyle = '#262525'; // KiCad's "black body"
  ctx.fillRect(0, 0, 1024, 256);
  // The stripe of − signs, on the side of the − lead (+x: three-quarters of the way round, see below).
  ctx.fillStyle = '#b0a998'; // KiCad's "light brown label"
  ctx.fillRect(700, 0, 140, 256);
  ctx.fillStyle = '#262525';
  for (let y = 30; y < 256; y += 56) ctx.fillRect(745, y, 50, 12);
  // The value and voltage, facing the front (+z, halfway round).
  ctx.fillStyle = '#e4e3cf'; // KiCad's "white body", as print
  ctx.textAlign = 'center';
  ctx.font = '600 58px system-ui, sans-serif';
  ctx.fillText(`${String(microfarads)}µF`, 512, 112);
  ctx.font = '500 46px system-ui, sans-serif';
  ctx.fillText(`${String(volts)}V  UVR`, 512, 176);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function buildCapacitor(spec: ElectrolyticSpec): CapacitorModel {
  const o = outside(spec);
  const i = INSIDE;
  const R = o.diameter.mm / 2;
  const L = o.length.mm;
  const P = o.leadSpacing.mm;
  const can = R - i.sleeve.mm; // the can's outside
  const rollR = can - i.wall.mm - i.gap.mm;
  const rollBottom = i.seal.mm + 0.3;
  const rollTop = L - 0.8;
  const groove = { from: i.grooveUp.mm, to: i.grooveUp.mm + i.grooveHeight.mm, depth: i.grooveDepth.mm };

  const lift = (rollLift: number, canLift: number, sleeveLift: number): Record<CapPiece, number> => ({
    sleeve: sleeveLift,
    can: canLift,
    vent: canLift,
    roll: rollLift,
    anode: rollLift,
    paper: rollLift,
    cathode: rollLift,
    plusTab: rollLift,
    minusTab: rollLift,
    seal: 0,
    plusLead: 0,
    minusLead: 0,
  });
  // Taken apart: the roll rises off the seal, the can lifts clear of the roll, the sleeve slides up off the can.
  const k = kit(CAP_PIECES, MADE_OF, lift(0.15 * L + 1, 1.15 * L + 4, 2.3 * L + 8));
  const { add, materials } = k;
  materials.can.side = THREE.DoubleSide;
  materials.sleeve.side = THREE.DoubleSide;

  // The can: a shell turned on a lathe, its rim rolled under at the base, the groove pressed in above it, its top
  // rounded over.
  const canProfile = [
    [can - 0.35, 0],
    [can, 0.35],
    [can, groove.from],
    [can - groove.depth, groove.from + 0.2],
    [can - groove.depth, groove.to - 0.2],
    [can, groove.to],
    [can, L - 0.4],
    [can - 0.4, L],
    [0.001, L],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  add('can', new THREE.LatheGeometry(canProfile, 64));

  // The vent: two score lines across the top, where the sleeve leaves the aluminium bare.
  const bare = i.topOpening.mm * R;
  add('vent', box(1.2 * bare, 0.03, 0.22, 0, L + 0.015, 0));
  add('vent', box(0.22, 0.03, 1.2 * bare, 0, L + 0.015, 0));

  // The sleeve: printed round its side, following the groove in, wrapped over the top edge and under the base.
  const print = k.own(sleevePrint(spec.farads * 1e6, spec.ratedVolts) ?? new THREE.Texture());
  if (print.image) {
    materials.sleeve.map = print;
    materials.sleeve.color.set('#ffffff');
  }
  const side = new THREE.CylinderGeometry(R, R, L - 0.3 - groove.to, 96, 1, true, Math.PI, Math.PI * 2);
  side.translate(0, (groove.to + L - 0.3) / 2, 0);
  add('sleeve', side);
  const rims = [
    [0.85 * R, 0],
    [R, 0.2],
    [R, groove.from],
    [R - groove.depth, groove.from + 0.2],
    [R - groove.depth, groove.to - 0.2],
    [R, groove.to],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const plain = k.own(materialFor('blackBody', { side: THREE.DoubleSide }));
  add('sleeve', new THREE.LatheGeometry(rims, 96), plain);
  const top = [
    [R, L - 0.3],
    [R - 0.3, L + 0.02],
    [bare, L + 0.02],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  add('sleeve', new THREE.LatheGeometry(top, 96), plain);

  // The rubber seal closing the base, and the leads coming out of it: + towards −x (pin 1), − towards +x.
  add('seal', cylinder(can - i.wall.mm, 0.05, i.seal.mm));
  const leadR = o.leadDiameter.mm / 2;
  const plusLength = o.minusLead.mm + o.plusLonger.mm;
  add('plusLead', cylinder(leadR, -plusLength, 0.3, -P / 2, 0, 24));
  add('minusLead', cylinder(leadR, -o.minusLead.mm, 0.3, P / 2, 0, 24));

  // The tabs: aluminium strips from the roll down through the seal to the leads.
  add('plusTab', box(i.tabWidth.mm, rollBottom - 0.2, i.tabThickness.mm, -P / 2, (rollBottom + 0.2) / 2, 0));
  add('minusTab', box(i.tabWidth.mm, rollBottom - 0.2, i.tabThickness.mm, P / 2, (rollBottom + 0.2) / 2, 0));

  // The roll: its side is the outer paper; its top shows the layers wound round, as rings.
  // Its ends are the edges of the foils (and paper) wound round: aluminium, from the material library.
  const ends = k.own(materialFor('aluminium'));
  add('roll', cylinder(rollR, rollBottom, rollTop, 0, 0, 64), [materials.roll, ends, ends]);
  for (let r = rollR * 0.25; r < rollR; r += Math.max(0.35, rollR / 9)) {
    const ring = new THREE.RingGeometry(r, r + 0.08, 64);
    ring.rotateX(-Math.PI / 2);
    ring.translate(0, rollTop + 0.01, 0);
    add('roll', ring, materials.roll);
  }

  // The layers, pulled out of the roll when it's unrolled: unit boxes, sized and placed by setUnroll.
  const strips = (
    [
      ['anode', LAYERS.anode.mm],
      ['paper', LAYERS.paper.mm],
      ['cathode', LAYERS.cathode.mm],
    ] as const
  ).map(([id, thickness]) => ({ id, thickness, mesh: add(id, new THREE.BoxGeometry(1, 1, 1)) }));
  const height = rollTop - rollBottom;

  const anchors = {
    plus: k.anchor('plusLead', -P / 2, -plusLength - 1.2, 0),
    minus: k.anchor('minusLead', P / 2, -o.minusLead.mm - 1.2, 0),
    anodeEnd: k.anchor('anode', 0, 0, 0),
    paperEnd: k.anchor('paper', 0, 0, 0),
    cathodeEnd: k.anchor('cathode', 0, 0, 0),
  };

  const pins = [
    { id: 'plus', name: '+', at: [0, 0, 0] as const, direction: [0, -1, 0] as const, widthMm: o.leadDiameter.mm },
    { id: 'minus', name: '−', at: [P, 0, 0] as const, direction: [0, -1, 0] as const, widthMm: o.leadDiameter.mm },
  ];
  const base = k.model([-P / 2, 0, 0], pins, anchors);

  const setUnroll = (amount: number) => {
    const f = Math.min(1, Math.max(0, amount));
    // The roll gets smaller as its outer turns come off; the layers come out of its front, fanned well apart, each
    // a quarter shorter than the one before so every one's end shows.
    const radius = rollR * (1 - 0.3 * f);
    k.groups.roll.scale.set(radius / rollR, 1, radius / rollR);
    const reach = f * UNROLL_DIAMETERS * o.diameter.mm;
    let z = radius;
    for (const [n, strip] of strips.entries()) {
      const length = reach * (1 - 0.25 * n);
      strip.mesh.visible = f > 0.01;
      strip.mesh.scale.set(Math.max(length, 0.001), height, strip.thickness);
      strip.mesh.position.set(length / 2, (rollBottom + rollTop) / 2, z + strip.thickness / 2);
      const end = anchors[`${strip.id}End` as const];
      end.position.set(length + 0.8, rollTop - 1.5 - n * 3, z + strip.thickness / 2);
      z += strip.thickness + 2.2 * f;
    }
  };
  setUnroll(0);
  return { ...base, setUnroll };
}
