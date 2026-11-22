import { expect } from 'vitest';
import {
  NotWrittenYet,
  type Branch,
  type Circuit,
  type Curve,
  type Node,
  type Part,
  type Readings,
  type Stamp,
} from '../src/index';

export const THERMAL_VOLTS = 0.025852;

/** An ideal voltage source, for tests that need an exact voltage. */
export class Source implements Part {
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

  current(r: Readings): number {
    return r.branchCurrent(this.branch);
  }
}

/** An ideal current source: pushes `amps` from `from` into `to`, whatever it takes. */
export class FixedCurrent implements Part {
  constructor(
    readonly name: string,
    readonly from: Node,
    readonly to: Node,
    public amps: number,
  ) {}

  stamp(s: Stamp): void {
    s.currentSource(this.from, this.to, this.amps);
  }

  current(): number {
    return this.amps;
  }
}

/** A textbook diode, used to test the solver's handling of exponentials. */
export class TestDiode implements Part {
  readonly curve: Curve;

  constructor(
    readonly name: string,
    readonly anode: Node,
    readonly cathode: Node,
    saturationAmps = 1e-14,
    emission = 1,
  ) {
    const nVt = emission * THERMAL_VOLTS;
    this.curve = {
      current: (v) => saturationAmps * Math.expm1(v / nVt),
      slope: (v) => (saturationAmps / nVt) * Math.exp(v / nVt),
    };
  }

  stamp(s: Stamp): void {
    s.junction(this.anode, this.cathode, this.curve);
  }

  current(r: Readings): number {
    return this.curve.current(r.across(this.anode, this.cathode));
  }
}

/** True unless `attempt` throws NotWrittenYet. Other errors propagate. */
export function isWritten(attempt: () => void): boolean {
  try {
    attempt();
    return true;
  } catch (error) {
    if (error instanceof NotWrittenYet) return false;
    throw error;
  }
}

/** A Stamp that records instead of solving, to inspect what a part stamps. */
export class SpyStamp implements Stamp {
  readonly time = 0;
  readonly ambient = 25;
  readonly curves: Curve[] = [];
  private readonly internals = new Map<string, Node>();

  internal(name: string): Node {
    let node = this.internals.get(name);
    if (node === undefined) {
      node = (1000 + this.internals.size) as Node;
      this.internals.set(name, node);
    }
    return node;
  }

  conductance(): void {
    // Not needed by the tests that use this spy.
  }

  currentSource(): void {
    // Not needed by the tests that use this spy.
  }

  voltageSource(): Branch {
    return 0 as Branch;
  }

  junction(anode: Node, cathode: Node, curve: Curve): void {
    this.curves.push(curve);
  }
}

/** Runs `circuit.step(dt)` until `seconds` have passed. */
export function run(circuit: Circuit, seconds: number, dt = 1 / 60): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) circuit.step(dt);
}

/**
 * Asserts the last solve obeys Kirchhoff's current law at every node and
 * conserves energy: every watt delivered is absorbed somewhere.
 */
export function expectConserved(circuit: Circuit): void {
  const { worstNodeAmps, powerImbalance, powerDelivered } = circuit.audit();
  expect(worstNodeAmps, 'current in ≠ current out at a node').toBeLessThan(1e-9);
  expect(powerImbalance, 'power delivered ≠ power absorbed').toBeLessThan(1e-9 + 1e-9 * powerDelivered);
}
