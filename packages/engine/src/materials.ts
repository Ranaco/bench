/** Conductors and wire sizes: where a wire's resistance comes from. */

/** A conducting material. */
export interface Conductor {
  readonly name: string;
  /** How strongly the material resists current, Ω·m at 20 °C. Resistance = resistivity × length ÷ area. */
  readonly resistivity: number;
  /** How much more it resists per degree warmer, per °C. */
  readonly tempco: number;
}

/**
 * Annealed copper, the reference every wire table is built on (IEC 60028, the
 * International Annealed Copper Standard): 1.7241 × 10⁻⁸ Ω·m at 20 °C, rising
 * 0.393 % per °C.
 */
export const COPPER: Conductor = { name: 'annealed copper', resistivity: 1.7241e-8, tempco: 0.00393 };

/**
 * Cross-section of a round wire of the given AWG gauge, in m². ASTM B258
 * defines the diameter: d = 0.127 mm × 92^((36 − gauge) / 39). Bigger gauge
 * numbers are thinner wires.
 */
export function awgArea(gauge: number): number {
  const diameter = 0.127e-3 * 92 ** ((36 - gauge) / 39);
  return (Math.PI * diameter * diameter) / 4;
}

/** Resistance of a length of conductor, in Ω, at the given temperature. */
export function conductorOhms(conductor: Conductor, lengthMetres: number, areaSquareMetres: number, celsius: number): number {
  const resistivity = conductor.resistivity * (1 + conductor.tempco * (celsius - 20));
  return (resistivity * lengthMetres) / areaSquareMetres;
}
