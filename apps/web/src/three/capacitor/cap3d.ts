import type { ElectrolyticSpec } from '@bench/engine';
import { drawn, printed, type Size } from '../core/units';

/**
 * A Nichicon UVR radial electrolytic in 3D, one size per row of its datasheet
 * (CAT.8100M). The outside comes from the row and the radial lead drawing; the
 * inside isn't on the datasheet, so it follows Nichicon's technical notes
 * (CAT.8101H) and is drawn as an illustration. Built standing on its seal at y = 0, with its axis on the y
 * axis, + lead towards −x; the finished model moves so the + lead (pin 1) is
 * the origin (docs/3d.md §2).
 */

export interface CapOutside {
  readonly diameter: Size;
  readonly length: Size;
  readonly leadSpacing: Size;
  readonly leadDiameter: Size;
  readonly minusLead: Size;
  readonly plusLonger: Size;
}

/** The outside, from the datasheet: the row's case and leads, and the radial lead drawing. */
export function outside(spec: ElectrolyticSpec): CapOutside {
  return {
    diameter: printed(spec.diameterMm, 'case, across (φD; up to 0.5 mm more)'),
    length: printed(spec.lengthMm, `case, long (L, ±${spec.lengthMm < 20 ? '1.5' : '2.0'} mm)`),
    leadSpacing: printed(spec.leadSpacingMm, 'between the leads (P, ±0.5 mm)'),
    leadDiameter: printed(spec.leadDiameterMm, 'each lead, across (φd)'),
    minusLead: printed(15, 'the leads below the case, at least ("15 min.")'),
    plusLonger: printed(4, 'how much longer the + lead is, at least ("4 min.")'),
  };
}

/** The inside, and the outside details the datasheet doesn't dimension: illustrations. */
export const INSIDE = {
  sleeve: drawn(0.1, 'the plastic sleeve, thick'),
  wall: drawn(0.3, 'the aluminium can, thick'),
  seal: drawn(1.6, 'the rubber seal, thick'),
  // KiCad's generator draws the can's pressed groove ("belt") 1.0 mm up from the base, 0.2 mm deep and 1.0 mm tall.
  grooveUp: drawn(1, 'the groove pressed round the can, above its base'),
  grooveDepth: drawn(0.2, 'that groove, deep'),
  grooveHeight: drawn(1, 'that groove, tall'),
  // And the bare aluminium left showing on top 0.7 × φD across.
  topOpening: drawn(0.7, 'share of the top left bare by the sleeve'),
  gap: drawn(0.4, 'room between the roll and the can'),
  tabWidth: drawn(1.2, 'each aluminium tab, wide'),
  tabThickness: drawn(0.15, 'each tab, thick'),
} as const satisfies Record<string, Size>;

/**
 * The layers of the roll, drawn thick enough to see and pick. Real ones are far thinner: anode foil 0.05 to
 * 0.11 mm, cathode foil 0.02 to 0.05 mm, and the oxide that does the insulating only about 1.3 to 1.5 nm per
 * volt it's formed for (Nichicon CAT.8101H): too thin to draw at all.
 */
export const LAYERS = {
  anode: drawn(0.35, 'anode foil, exaggerated (really 0.05–0.11 mm)'),
  cathode: drawn(0.25, 'cathode foil, exaggerated (really 0.02–0.05 mm)'),
  paper: drawn(0.3, 'paper soaked in electrolyte, exaggerated'),
} as const satisfies Record<string, Size>;

/** How far the roll unrolls, at most, as a multiple of the case's diameter: enough to see the layers. */
export const UNROLL_DIAMETERS = 2.2;
