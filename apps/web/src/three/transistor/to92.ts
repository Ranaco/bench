import { drawn, printed, scaled, type Size } from '../core/units';

/**
 * The PN2222A in 3D: a TO-92 case, from onsemi's drawing of the straight-lead one its KSP2222A datasheet uses,
 * "TO-92 3 4.825x4.76", case 135AN (document 98AON13880G, 31 July 2016). The drawing gives each size as a range;
 * the model uses the middle, as the drawing's own name does (4.825 × 4.76 mm is the middle of its height and width).
 *
 * Built with the middle leg (the base) on the y axis, the legs in a row along x, the flat face towards +z and the
 * body sitting on y = 0; the finished model moves so leg 1, the emitter, is the origin (docs/3d.md §2). Looking at
 * the flat face, the legs are 1, 2, 3 from the left: emitter, base, collector (KSP2222A, page 1).
 */
export const CASE = {
  width: printed(4.76, 'body, across (4.32 to 5.20)'),
  height: printed(4.825, 'body, tall (4.32 to 5.33)'),
  depth: printed(3.62, 'body, flat face to the back of the round (3.05 to 4.19)'),
  behindLegs: printed(2.395, 'from the legs to the back of the round (2.13 to 2.66)'),
  legLength: printed(14.41, 'legs, below the body (13.20 to 15.62)'),
  legWidth: printed(0.46, 'each leg, across (0.36 to 0.56)'),
  legThickness: printed(0.41, 'each leg, front to back (0.30 to 0.52)'),
  pitch: printed(1.27, 'from one leg to the next (exact)'),
} as const satisfies Record<string, Size>;

/** The round back: drawn reaching the body's full width, so its radius is half that. */
export const BACK_RADIUS = scaled(CASE.width.mm / 2, 'the round back, its radius: half the width, as drawn');

/** How far in front of the legs the flat face is: the printed depth, less the legs' printed distance from the back. */
export const FLAT_AHEAD = scaled(CASE.depth.mm - CASE.behindLegs.mm, 'the flat face, in front of the legs');

/**
 * Where it sits: the drawing measures the legs from the body down and gives no height above a board, so the body is
 * drawn sitting on it, as the capacitor does. In practice it stands a few millimetres up on its legs.
 */
export const SEATED = drawn(0, 'the body’s bottom, above the board');

/** The inside, which no datasheet shows: an illustration. */
export const INSIDE = {
  legTops: drawn(2, 'how far the emitter and base legs reach up into the body'),
  flagBottom: drawn(2.4, 'where the collector leg widens into the flag the chip sits on'),
  flagTop: drawn(3.6, 'the flag’s top'),
  flagLeft: drawn(-0.7, 'the flag’s left edge, from the base leg'),
  chip: drawn(0.7, 'the chip, square'),
  chipThickness: drawn(0.2, 'the chip, thick'),
  wire: drawn(0.05, 'each bond wire, across: thick enough to see'),
  bevel: drawn(0.15, 'the body’s rounded edges'),
} as const satisfies Record<string, Size>;

/**
 * The chip's layers, shown beside it, magnified: a sketch of the order, N, P, N from the top down, not of the sizes.
 * Nothing here is to scale; a real base is far thinner than drawn.
 */
export const LAYERS = {
  width: drawn(6, 'the sketch, across'),
  deep: drawn(3, 'the sketch, front to back'),
  collector: drawn(3, 'collector layer, thick'),
  base: drawn(0.6, 'base layer, thick: drawn thin, as it is'),
  emitter: drawn(1.2, 'emitter layer, thick'),
  emitterWidth: drawn(3.4, 'emitter, across: it sits in the middle of the base'),
  aside: drawn(5, 'how far right of the body the sketch sits'),
} as const satisfies Record<string, Size>;
