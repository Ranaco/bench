import type { Branch, Node, Part, Readings, Stamp } from '../types';

/**
 * Supply: an ideal bench power supply. It holds plus exactly `volts` above
 * minus, whatever current that takes. Real supplies have limits; this one is
 * for measuring parts, the way a lab does.
 */
export class Supply implements Part {
  private branch = 0 as Branch;

  constructor(
    readonly name: string,
    readonly plus: Node,
    readonly minus: Node,
    public volts: number,
  ) {}

  stamp(s: Stamp): void {
    this.branch = s.voltageSource(this.plus, this.minus, this.volts);
  }

  /** Amps pushed out of the plus terminal. */
  current(r: Readings): number {
    return r.branchCurrent(this.branch);
  }
}
