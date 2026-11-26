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

/** How long ago, in a few words: "just now", "5 min ago", "3 h ago", "2 days ago", then the date. */
export function ago(then: number, now: number): string {
  const minutes = Math.floor((now - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${String(minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${String(days)} days ago`;
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
