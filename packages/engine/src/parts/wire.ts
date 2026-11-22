import { awgArea, conductorOhms, COPPER, type Conductor } from '../materials';
import type { Node, Part, Readings, Stamp } from '../types';

/** What a wire is made of and how big it is. */
export interface WireSpec {
  readonly lengthMetres: number;
  /** AWG gauge: 22 is the usual breadboard jumper. */
  readonly gauge: number;
  readonly conductor: Conductor;
}

/** A 10 cm, 22 AWG copper jumper wire, the kind in every breadboard kit. */
export const JUMPER: WireSpec = { lengthMetres: 0.1, gauge: 22, conductor: COPPER };

/**
 * Wire: a real connection, with the small resistance its metal and size give
 * it. Not zero: at a few amps, even a jumper wire drops a measurable voltage.
 *
 * It stays at the air's temperature; at the currents in these builds it barely
 * warms.
 */
export class Wire implements Part {
  private lastOhms: number;

  constructor(
    readonly name: string,
    readonly a: Node,
    readonly b: Node,
    readonly spec: WireSpec = JUMPER,
  ) {
    this.lastOhms = this.ohmsAt(20);
  }

  /** Its resistance at `celsius`, Ω. */
  ohmsAt(celsius: number): number {
    return conductorOhms(this.spec.conductor, this.spec.lengthMetres, awgArea(this.spec.gauge), celsius);
  }

  /** Its resistance in the last solve, Ω. */
  get ohms(): number {
    return this.lastOhms;
  }

  stamp(s: Stamp): void {
    this.lastOhms = this.ohmsAt(s.ambient);
    s.conductance(this.a, this.b, 1 / this.lastOhms);
  }

  current(r: Readings): number {
    return r.across(this.a, this.b) / this.lastOhms;
  }
}
