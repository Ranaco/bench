import { Circuit } from './circuit';
import { Supply } from './parts/supply';
import { GROUND, type Node, type Part } from './types';

/** One point of a current-vs-voltage graph. */
export interface IvPoint {
  readonly volts: number;
  readonly amps: number;
}

/**
 * Measures a two-terminal part the way a datasheet graph is made: hold a
 * voltage across it, read the current, step the voltage up, repeat.
 *
 * Returns undefined while the part's stamp() isn't written yet.
 */
export function sweep(
  make: (a: Node, b: Node) => Part,
  from: number,
  to: number,
  steps: number,
): IvPoint[] | undefined {
  const circuit = new Circuit();
  const a = circuit.node('a');
  const supply = circuit.add(new Supply('V', a, GROUND, from));
  const part = circuit.add(make(a, GROUND));

  const points: IvPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    supply.volts = from + ((to - from) * i) / steps;
    const { converged } = circuit.step(0);
    if (circuit.notWritten.some((m) => m.part === part.name && m.method === 'stamp')) return undefined;
    if (!converged) continue;
    // The supply's current is the part's current, so this works before current() is written.
    points.push({ volts: supply.volts, amps: circuit.currentThrough(supply) ?? Number.NaN });
  }
  return points;
}
