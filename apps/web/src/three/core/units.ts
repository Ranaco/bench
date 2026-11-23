/**
 * Units and provenance for every 3D model (docs/3d.md §1–2). Geometry is built
 * in millimetres straight from datasheets; the scene is in metres, so each
 * model's root is scaled by MM.
 */

/** Metres per millimetre: the scale on every model's root. */
export const MM = 0.001;

/**
 * Where a size comes from:
 *   printed  printed on the datasheet's drawing or table (or its recommended board layout)
 *   scaled   measured off the drawing's proportions, where it prints no number
 *   drawn    not on the datasheet: an illustration (most insides), or a stand-in
 */
export type SizeSource = 'printed' | 'scaled' | 'drawn';

export interface Size {
  readonly mm: number;
  readonly source: SizeSource;
  /** What it measures, as the drawing labels it. */
  readonly what: string;
}

export const printed = (mm: number, what: string): Size => ({ mm, source: 'printed', what });
export const scaled = (mm: number, what: string): Size => ({ mm, source: 'scaled', what });
export const drawn = (mm: number, what: string): Size => ({ mm, source: 'drawn', what });

/**
 * A pin, as a breadboard will see it: where it enters the board, in the model's
 * own millimetres (pin 1 at the origin, on the surface the part sits on), which
 * way it goes in, and how thick it is there.
 */
export interface PinDecl {
  readonly id: string;
  /** What it's called: "pin 1", "+", "anode". */
  readonly name: string;
  readonly at: readonly [x: number, y: number, z: number];
  /** Unit vector the pin points along, into the board: [0, -1, 0] for a straight lead. */
  readonly direction: readonly [x: number, y: number, z: number];
  /** Across its widest, where it enters the board, mm. */
  readonly widthMm: number;
}
