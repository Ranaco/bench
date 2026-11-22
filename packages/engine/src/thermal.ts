import { AMBIENT_CELSIUS } from './types';

/**
 * A lump of material that warms up when power goes into it and cools toward
 * the air around it.
 *
 *   Steady state:  temperature = ambient + watts × kelvinPerWatt
 *   Getting there: an exponential with time constant τ = kelvinPerWatt × joulesPerKelvin
 *
 * Each update solves that exactly for the step's power, so the result doesn't
 * depend on how the time is chopped up.
 */
export class ThermalMass {
  /** Current temperature, °C. */
  celsius: number;

  /**
   * @param kelvinPerWatt   thermal resistance to the air: how many degrees
   *                        hotter each watt makes it, once settled
   * @param joulesPerKelvin heat capacity: energy to warm it by one degree
   */
  constructor(
    readonly kelvinPerWatt: number,
    readonly joulesPerKelvin: number,
    celsius = AMBIENT_CELSIUS,
  ) {
    if (!(kelvinPerWatt > 0) || !(joulesPerKelvin > 0)) {
      throw new RangeError('Thermal resistance and heat capacity must both be positive');
    }
    this.celsius = celsius;
  }

  /** Seconds to cover 63% of the way to a new steady temperature. */
  get timeConstant(): number {
    return this.kelvinPerWatt * this.joulesPerKelvin;
  }

  /** Puts `watts` in for `dt` seconds with the air at `ambient` °C. Returns the new temperature. */
  update(watts: number, dt: number, ambient: number): number {
    const settled = ambient + watts * this.kelvinPerWatt;
    this.celsius = settled + (this.celsius - settled) * Math.exp(-dt / this.timeConstant);
    return this.celsius;
  }
}
