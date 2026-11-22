import type { Branch, Node, Part, Readings, Stamp } from '../types';

/** A fresh battery's datasheet numbers. */
export interface CellSpec {
  /** Its push with nothing connected, V. */
  readonly volts: number;
  /** Its internal resistance, Ω. */
  readonly ohms: number;
}

/**
 * Energizer 522, a 9 V alkaline, fresh. The internal resistance is read from
 * its engineering data sheet (EBC-1108E, "Internal Resistance, typical values
 * at 20 °C": 1.75 Ω fresh, rising to about 12 Ω when flat). The voltage is its
 * fresh closed-circuit voltage under light loads in the same sheet, 9.3 V,
 * plus the little those loads cost inside it.
 */
export const ENERGIZER_522: CellSpec = { volts: 9.35, ohms: 1.75 };

/**
 * Energizer E91, one AA alkaline cell, fresh. Its datasheet (EBC-1102Q) gives
 * "150 to 300 milliohms (fresh)"; this is the middle of that range. Its
 * light-load test curves start at 1.5 V.
 */
export const ENERGIZER_E91: CellSpec = { volts: 1.5, ohms: 0.225 };

/**
 * Battery: a push of `volts`, with a little resistance inside it.
 *
 *   plus ──/\/\/── cell ──| |── minus
 *          ohms        volts
 *
 * An ideal battery would hold its voltage whatever you connect. A real one
 * has internal resistance, so the harder you draw on it, the more its voltage
 * sags. Short one with a wire and it delivers volts / ohms amps and gets hot.
 *
 * The point between the two halves is a node only this battery knows about,
 * so it asks for one with s.internal().
 */
export class Battery implements Part {
  private branch = 0 as Branch;

  constructor(
    readonly name: string,
    readonly plus: Node,
    readonly minus: Node,
    public volts: number,
    public ohms: number,
  ) {}

  stamp(s: Stamp): void {
    const cell = s.internal('cell');
    this.branch = s.voltageSource(cell, this.minus, this.volts);
    s.conductance(cell, this.plus, 1 / this.ohms);
  }

  /** Amps pushed out of the plus terminal. */
  current(r: Readings): number {
    return r.branchCurrent(this.branch);
  }
}
