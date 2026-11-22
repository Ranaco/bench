import type { Node, Part } from '../types';

/**
 * Junction: where a wire is tapped and others join it. It's an ideal node,
 * a point the wires share, so it adds nothing of its own: no resistance, no
 * voltage, no current through it. The wires meeting there carry the current.
 */
export class Junction implements Part {
  constructor(
    readonly name: string,
    readonly pin: Node,
  ) {}

  stamp(): void {
    // Nothing to describe: the wires joined at `pin` do all the work.
  }

  /** No current flows "through" a point; Kirchhoff's law balances what flows in and out of it. */
  current(): number {
    return 0;
  }
}
