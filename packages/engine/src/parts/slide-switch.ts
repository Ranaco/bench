import type { Node, Part, Readings, Stamp } from '../types';
import { SLIDE_SWITCH, Switch, type SwitchSpec } from '../lesson-2-switches/switch';

/** Which side a slide switch is slid to. */
export type Side = 'a' | 'b';

/**
 * A slide switch (SPDT: one pole, two throws). The middle pin, common, is
 * always connected to one of the two outer pins, A or B, and never both: the
 * EG1218 is "non-shorting", so it breaks one side before it makes the other.
 *
 *              ┌── A
 *   common ──o/
 *              └── B
 *
 * Inside it's two of your switches sharing the common pin, exactly one of
 * them closed. Use common and one side, and it's a plain on/off switch.
 */
export class SlideSwitch implements Part {
  readonly toA: Switch;
  readonly toB: Switch;

  constructor(
    readonly name: string,
    readonly common: Node,
    readonly a: Node,
    readonly b: Node,
    side: Side = 'a',
    readonly spec: SwitchSpec = SLIDE_SWITCH,
  ) {
    this.toA = new Switch(name, common, a, side === 'a', spec);
    this.toB = new Switch(name, common, b, side === 'b', spec);
  }

  /** The side common is connected to. */
  get side(): Side {
    return this.toA.closed ? 'a' : 'b';
  }

  set side(side: Side) {
    this.toA.closed = side === 'a';
    this.toB.closed = side === 'b';
  }

  stamp(s: Stamp): void {
    this.toA.stamp(s);
    this.toB.stamp(s);
  }

  /** Amps in at common and out of the side it's slid to. */
  current(r: Readings): number {
    return (this.side === 'a' ? this.toA : this.toB).current(r);
  }
}
