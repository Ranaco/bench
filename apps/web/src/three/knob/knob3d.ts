import { KNOB_10K } from '@bench/engine';
import { drawn, printed, scaled, type Size } from '../core/units';

/**
 * The knob in 3D: a Bourns PTV09A-4 (rear mount, no bushing) with the 15 mm
 * flat ("F") shaft, the version that stands on a board with its shaft pointing
 * up. Every size is in millimetres and says where it comes from:
 *
 *   printed   a dimension printed on the datasheet's drawing (REV. 01/25), or
 *             on its recommended circuit-board layout
 *   scaled    measured off the drawing's proportions, where it prints no number
 *   drawn     not on the datasheet at all: the inside. The datasheet shows only
 *             the outside, so the pieces inside are an illustration of how
 *             carbon knobs like this are built, not this one's measurements.
 *
 * Axes, while it's built: the back of the body sits on the board at y = 0, the
 * shaft points up +y along the y axis, and looking down the shaft +x is right
 * with the pins at the bottom (+z), as in the datasheet's front view. The
 * finished model then moves so pin 1 is the origin (docs/3d.md §2).
 */


/** The outside, from the PTV09A-4 drawing and the F-type shaft table (L = 15, F = 6). */
export const OUTSIDE = {
  bodyWidth: printed(10, 'body width'),
  axisToTop: printed(5.5, 'shaft centre to the top of the body'),
  axisToBottom: scaled(5.5, 'shaft centre to the bottom of the body'),
  ledge: scaled(1.1, 'terminal ledge below the body'),
  depth: printed(6.8, 'back of the body to its metal front'),
  plate: scaled(0.3, 'metal front plate'),
  collar: printed(1.1, 'raised ring the shaft comes out of, in front of the plate'),
  collarDiameter: scaled(7.2, 'that ring, across'),
  earsAcross: printed(11.4, 'across the two metal ears'),
  earSlots: printed(10.6, 'between the slots for the ears in the board layout'),
  earWidth: printed(2, 'leg of each ear, wide'),
  earsBelow: printed(3.8, 'legs of the ears, below the back of the body'),
  shaftDiameter: printed(6, 'shaft, across (6.0 +0/−0.1)'),
  shaftLength: printed(15, 'shaft tip above the back of the body (L)'),
  flatLength: printed(6, 'length of the flat (F, for L = 15)'),
  flatLeaves: printed(4.5, 'shaft across the flat'),
  pinPitch: printed(2.5, 'pin to pin (5.0 from pin 1 to pin 3)'),
  pinWidth: printed(1.5, 'each pin, wide where it leaves the body'),
  pinHole: printed(1, 'hole for each pin in the board layout, across'),
  pinTipWidth: drawn(0.8, 'tip of each pin, wide: thin enough for its hole (0.8 is printed for the other versions)'),
  pinThickness: drawn(0.5, 'each pin, thick: thin enough for its hole'),
  axisToPins: printed(7, 'shaft centre to the pins'),
  pinsBelow: scaled(3, 'pins below the back of the body'),
  pinsBend: scaled(4.3, 'where the pins come out of the body, above its back'),
} as const satisfies Record<string, Size>;

/** The inside: an illustration. The datasheet gives none of these. */
export const INSIDE = {
  wall: drawn(0.8, 'housing wall'),
  floor: drawn(2, 'housing floor'),
  boardThickness: drawn(0.6, 'the board the track is printed on'),
  boardRadius: drawn(4.15, 'that board, centre to edge'),
  trackInner: drawn(2.5, 'carbon track, inner edge'),
  trackOuter: drawn(3.9, 'carbon track, outer edge'),
  ringInner: drawn(1, 'silver ring for pin 2, inner edge'),
  ringOuter: drawn(1.8, 'silver ring for pin 2, outer edge'),
  rotorRadius: drawn(4.1, 'the disc the wiper rides on'),
  rotorThickness: drawn(1.2, 'that disc, thick'),
} as const satisfies Record<string, Size>;

/**
 * Where the shaft points, as an angle clockwise from the top of the front view
 * (degrees), for a turn from 0 (all the way anticlockwise, towards pin 1) to 1.
 *
 * The drawing shows the shaft's flat facing 40° clockwise from the top at its
 * full anticlockwise position, and facing the pins (180°) in the middle; it
 * turns `KNOB_10K.turnDegrees` (280°) between its stops.
 */
export const FLAT_AT_FULL_CCW = 40;

export function flatAngle(turn: number): number {
  return normalise(FLAT_AT_FULL_CCW + clamp01(turn) * KNOB_10K.turnDegrees);
}

/**
 * Where the wiper touches the track: opposite the flat. That puts it at the
 * top in the middle of the turn, with the track's gap at the bottom where the
 * pins are, and its two ends beside pins 1 and 3.
 */
export function wiperAngle(turn: number): number {
  return normalise(flatAngle(turn) + 180);
}

/** The wiper's angle without wrapping round, so arcs can be measured along the track (220° to 500°). */
export function wiperAlong(turn: number): number {
  return FLAT_AT_FULL_CCW + 180 + clamp01(turn) * KNOB_10K.turnDegrees;
}

/**
 * The carbon between the two silver ends, as angles along the track. The
 * datasheet's taper rises in a straight line from 5 % to 95 % of the turn, so
 * over the first and last 5 % the wiper rests on the silver ends.
 */
export function carbon(): { readonly from: number; readonly to: number } {
  const start = wiperAlong(0);
  return {
    from: start + KNOB_10K.deadZone * KNOB_10K.turnDegrees,
    to: start + (1 - KNOB_10K.deadZone) * KNOB_10K.turnDegrees,
  };
}

/** The two pieces of carbon the wiper splits the track into, as arcs [from, to] along it. */
export function pieces(turn: number): { readonly toPin1: readonly [number, number]; readonly toPin3: readonly [number, number] } {
  const { from, to } = carbon();
  const at = Math.min(to, Math.max(from, wiperAlong(turn)));
  return { toPin1: [from, at], toPin3: [at, to] };
}

/**
 * How far to turn for a drag around the shaft: `degrees` of drag (clockwise as
 * seen from the shaft's tip) over its whole travel.
 */
export const turnForDegrees = (degrees: number) => degrees / KNOB_10K.turnDegrees;

/** The same for a straight drag, like the dial on the board: up or right turns towards pin 3. */
export const TURN_PIXELS = 200;
export const turnForDrag = (dx: number, dy: number) => (dx - dy) / TURN_PIXELS;

/** A turn kept to the knob's travel, to a thousandth, as the board stores it. */
export const settle = (turn: number) => Math.round(clamp01(turn) * 1000) / 1000;

/** Smallest signed difference between two angles in degrees, so dragging across ±180° doesn't jump. */
export function angleStep(from: number, to: number): number {
  return ((((to - from + 180) % 360) + 360) % 360) - 180;
}


function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function normalise(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}
