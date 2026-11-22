const PREFIXES: readonly (readonly [number, string])[] = [
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
  [1e-12, 'p'],
];

interface FormatOptions {
  /** Significant figures, like a meter's display. */
  readonly digits?: number;
  /** Drop trailing zeros ("4.7 kΩ" rather than "4.70 kΩ"). */
  readonly trim?: boolean;
  /** Anything smaller than this reads as zero, like a real meter's noise floor. */
  readonly floor?: number;
}

/** A value split for display: "21.3" and "mA". */
export interface Parts {
  readonly number: string;
  readonly unit: string;
}

/** Splits a value into a number and an SI-prefixed unit: 0.0213 A → "21.3", "mA". */
export function formatParts(value: number, unit: string, options: FormatOptions = {}): Parts {
  const { digits = 3, trim = false, floor = 0 } = options;
  if (!Number.isFinite(value)) return { number: '—', unit: '' };
  const size = Math.abs(value);
  if (size === 0 || size < floor) return { number: '0', unit };

  const smallest = PREFIXES[PREFIXES.length - 1];
  const [scale, prefix] = PREFIXES.find(([s]) => size >= s * 0.9995) ?? smallest;
  const text = (value / scale).toPrecision(digits);
  return { number: trim ? String(Number(text)) : text, unit: `${prefix}${unit}` };
}

/** Formats a value with an SI prefix: 0.0213 A → "21.3 mA". */
export function formatSI(value: number, unit: string, options: FormatOptions = {}): string {
  const parts = formatParts(value, unit, options);
  return parts.unit ? `${parts.number} ${parts.unit}` : parts.number;
}
