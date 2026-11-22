import { describe, expect, it } from 'vitest';
import { SingularMatrix } from '../src/index';
import { solveInPlace } from '../src/linear';

describe('solveInPlace', () => {
  it('solves a small system', () => {
    // 2x + y = 5, x + 3y = 10  →  x = 1, y = 3
    const x = solveInPlace(new Float64Array([2, 1, 1, 3]), new Float64Array([5, 10]), 2);
    expect(x[0]).toBeCloseTo(1, 12);
    expect(x[1]).toBeCloseTo(3, 12);
  });

  it('pivots past a zero on the diagonal', () => {
    // 0x + y = 2, x + y = 5  →  x = 3, y = 2
    const x = solveInPlace(new Float64Array([0, 1, 1, 1]), new Float64Array([2, 5]), 2);
    expect(x[0]).toBeCloseTo(3, 12);
    expect(x[1]).toBeCloseTo(2, 12);
  });

  it('refuses a system with no single answer', () => {
    expect(() => solveInPlace(new Float64Array([1, 2, 2, 4]), new Float64Array([1, 2]), 2)).toThrow(
      SingularMatrix,
    );
  });
});
