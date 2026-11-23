import * as THREE from 'three';

/**
 * Materials for parts in 3D (docs/3d.md §4). Metals are metalness 1 with
 * colours measured for the physicallybased.info database (CC0, v2, updated
 * 2026-11-03): linear RGB, so they're set with setRGB, never as hex. Nothing
 * measures tin, plastics, rubber or circuit boards, or any roughness: those are
 * stand-ins, marked `standIn`, from the nearest database entry or KiCad's
 * library colours (sRGB hex).
 */

export interface Finish {
  /** Linear RGB for measured metals, or an sRGB hex for everything else. */
  readonly color: readonly [number, number, number] | string;
  readonly metalness: 0 | 1;
  readonly roughness: number;
  /** Not measured: the nearest stand-in. */
  readonly standIn: boolean;
  /** Where it comes from. */
  readonly source: string;
}

const DB = 'physicallybased.info';

export const FINISHES = {
  aluminium: { color: [0.916, 0.923, 0.924], metalness: 1, roughness: 0.35, standIn: false, source: `${DB} "Aluminum"` },
  copper: { color: [0.932, 0.623, 0.522], metalness: 1, roughness: 0.3, standIn: false, source: `${DB} "Copper"` },
  silver: { color: [0.991, 0.985, 0.974], metalness: 1, roughness: 0.3, standIn: false, source: `${DB} "Silver"` },
  steel: { color: [0.669, 0.639, 0.598], metalness: 1, roughness: 0.3, standIn: false, source: `${DB} "Stainless Steel"` },
  brass: { color: [0.91, 0.778, 0.423], metalness: 1, roughness: 0.3, standIn: false, source: `${DB} "Brass"` },
  // Tin isn't in any database; zinc is the nearest pale grey metal measured.
  tin: { color: [0.808, 0.844, 0.865], metalness: 1, roughness: 0.25, standIn: true, source: `${DB} "Zinc", for tin` },
  // Phosphor bronze isn't either; brass is the nearest measured copper alloy.
  bronze: { color: [0.91, 0.778, 0.423], metalness: 1, roughness: 0.3, standIn: true, source: `${DB} "Brass", for phosphor bronze` },
  blackBody: { color: '#262525', metalness: 0, roughness: 0.55, standIn: true, source: 'KiCad 3D colours, "black body"' },
  whiteBody: { color: '#e4e3cf', metalness: 0, roughness: 0.55, standIn: true, source: 'KiCad 3D colours, "white body"' },
  greyBody: { color: '#464646', metalness: 0, roughness: 0.55, standIn: true, source: 'KiCad 3D colours, "dark grey body"' },
  lightPlastic: { color: '#b0a998', metalness: 0, roughness: 0.5, standIn: true, source: 'KiCad 3D colours, "light brown label"' },
  rubber: { color: [0.023, 0.023, 0.023], metalness: 0, roughness: 0.7, standIn: true, source: `${DB} "Tire", for rubber` },
  carbon: { color: [0.02, 0.02, 0.02], metalness: 0, roughness: 1, standIn: true, source: `${DB} "Charcoal", for carbon` },
  paper: { color: '#cdbf9f', metalness: 0, roughness: 0.85, standIn: true, source: 'an illustration: no paper is measured' },
  phenolic: { color: '#6e4b2c', metalness: 0, roughness: 0.75, standIn: true, source: 'an illustration: no board material is measured' },
} as const satisfies Record<string, Finish>;

export type FinishName = keyof typeof FINISHES;

/** A material for a finish: one per piece, so a piece can be lit up on its own. */
export function materialFor(name: FinishName, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const finish: Finish = FINISHES[name];
  const color = new THREE.Color();
  if (typeof finish.color === 'string') color.set(finish.color);
  else color.setRGB(...finish.color, THREE.LinearSRGBColorSpace);
  return new THREE.MeshStandardMaterial({ color, metalness: finish.metalness, roughness: finish.roughness, ...extra });
}
