/** Raised when a system of equations has no single answer. */
export class SingularMatrix extends Error {
  constructor(readonly column: number) {
    super(`The circuit's equations have no single solution (column ${String(column)})`);
    this.name = 'SingularMatrix';
  }
}

/**
 * Solves `a · x = b` for several right-hand sides at once: one elimination, then a back-substitution for each. Every
 * input is overwritten; each `b` becomes its `x`.
 */
export function solveAllInPlace(a: Float64Array, bs: readonly Float64Array[], n: number): readonly Float64Array[] {
  for (let col = 0; col < n; col++) {
    let pivot = col;
    let best = Math.abs(a[col * n + col]);
    for (let row = col + 1; row < n; row++) {
      const size = Math.abs(a[row * n + col]);
      if (size > best) {
        best = size;
        pivot = row;
      }
    }
    if (best === 0 || !Number.isFinite(best)) throw new SingularMatrix(col);
    if (pivot !== col) {
      for (let c = col; c < n; c++) {
        const held = a[col * n + c];
        a[col * n + c] = a[pivot * n + c];
        a[pivot * n + c] = held;
      }
      for (const b of bs) {
        const held = b[col];
        b[col] = b[pivot];
        b[pivot] = held;
      }
    }
    const diagonal = a[col * n + col];
    for (let row = col + 1; row < n; row++) {
      const factor = a[row * n + col] / diagonal;
      if (factor === 0) continue;
      for (let c = col; c < n; c++) a[row * n + c] -= factor * a[col * n + c];
      for (const b of bs) b[row] -= factor * b[col];
    }
  }
  for (const b of bs) {
    for (let row = n - 1; row >= 0; row--) {
      let sum = b[row];
      for (let c = row + 1; c < n; c++) sum -= a[row * n + c] * b[c];
      b[row] = sum / a[row * n + row];
    }
  }
  return bs;
}

/**
 * Solves `a · x = b` by Gaussian elimination with partial pivoting. `a` is an
 * n×n row-major matrix. Both inputs are overwritten; `b` becomes `x`.
 */
export function solveInPlace(a: Float64Array, b: Float64Array, n: number): Float64Array {
  for (let col = 0; col < n; col++) {
    let pivot = col;
    let best = Math.abs(a[col * n + col]);
    for (let row = col + 1; row < n; row++) {
      const size = Math.abs(a[row * n + col]);
      if (size > best) {
        best = size;
        pivot = row;
      }
    }
    if (best === 0 || !Number.isFinite(best)) throw new SingularMatrix(col);

    if (pivot !== col) {
      for (let c = col; c < n; c++) {
        const held = a[col * n + c];
        a[col * n + c] = a[pivot * n + c];
        a[pivot * n + c] = held;
      }
      const held = b[col];
      b[col] = b[pivot];
      b[pivot] = held;
    }

    const diagonal = a[col * n + col];
    for (let row = col + 1; row < n; row++) {
      const factor = a[row * n + col] / diagonal;
      if (factor === 0) continue;
      for (let c = col; c < n; c++) a[row * n + c] -= factor * a[col * n + c];
      b[row] -= factor * b[col];
    }
  }

  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let c = row + 1; c < n; c++) sum -= a[row * n + c] * b[c];
    b[row] = sum / a[row * n + row];
  }
  return b;
}
