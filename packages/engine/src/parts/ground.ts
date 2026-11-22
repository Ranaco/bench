import { GROUND, type Branch, type Node, type Part, type Readings, type Stamp } from '../types';

/**
 * Ground: the point every voltage is measured from. Wiring something to it
 * holds that point at exactly 0 V. Nothing about it is approximate: it's a
 * voltage source of 0 V between its pin and the circuit's reference.
 */
export class Ground implements Part {
  private branch = 0 as Branch;

  constructor(
    readonly name: string,
    readonly pin: Node,
  ) {}

  stamp(s: Stamp): void {
    this.branch = s.voltageSource(this.pin, GROUND, 0);
  }

  /** Amps flowing into ground through this symbol. */
  current(r: Readings): number {
    return -r.branchCurrent(this.branch);
  }
}
