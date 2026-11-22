const PREFIXES: Readonly<Partial<Record<string, number>>> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  µ: 1e-6,
  m: 1e-3,
  k: 1e3,
  M: 1e6,
};

/**
 * Reads a guess like "20 mA", "20m", "0.02" or "2,1 V". Bare numbers are in
 * base units (volts or amps). Returns undefined for anything else.
 */
export function parseGuess(text: string, unit: 'V' | 'A'): number | undefined {
  const match = /^\s*([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?)\s*(.*?)\s*$/i.exec(text);
  if (!match) return undefined;
  const value = Number(match[1].replace(',', '.'));
  let rest = match[2];

  const units = unit === 'V' ? /(?:v|volts?)$/i : /(?:a|amps?)$/i;
  rest = rest.replace(units, '').trim();
  if (rest === '') return value;
  const scale = PREFIXES[rest];
  return scale === undefined ? undefined : value * scale;
}

export interface Verdict {
  /** (guess − actual) / actual. */
  readonly error: number;
  readonly words: string;
}

/** How close a guess came. Within 5% is spot on; within 20% is close. */
export function judge(guess: number, actual: number): Verdict {
  const scale = Math.max(Math.abs(actual), 1e-9);
  const error = (guess - actual) / scale;
  const size = Math.abs(error);
  const percent = `${String(Math.round(size * 100))}%`;
  if (size <= 0.05) return { error, words: 'Spot on' };
  const direction = error > 0 ? 'high' : 'low';
  return { error, words: size <= 0.2 ? `Close, ${percent} ${direction}` : `${percent} ${direction}` };
}
