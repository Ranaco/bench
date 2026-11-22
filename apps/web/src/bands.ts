/** Resistor colour code: the stripes painted on a real resistor. */

export interface Band {
  readonly name: string;
  readonly color: string;
}

const DIGITS: readonly Band[] = [
  { name: 'black', color: '#1a1a1a' },
  { name: 'brown', color: '#8d5524' },
  { name: 'red', color: '#e53935' },
  { name: 'orange', color: '#fb8c00' },
  { name: 'yellow', color: '#fdd835' },
  { name: 'green', color: '#43a047' },
  { name: 'blue', color: '#1e88e5' },
  { name: 'violet', color: '#8e24aa' },
  { name: 'grey', color: '#9e9e9e' },
  { name: 'white', color: '#fafafa' },
];

const GOLD: Band = { name: 'gold', color: '#c9a227' };
const SILVER: Band = { name: 'silver', color: '#c0c0c0' };

/**
 * The four bands for a resistor: two digits, a multiplier and a tolerance
 * (gold, ±5%). A 0 Ω link has a single black band.
 */
export function bandsFor(ohms: number): readonly Band[] {
  if (ohms === 0) return [DIGITS[0]];
  const exponent = Math.floor(Math.log10(ohms) + 1e-9) - 1;
  const twoDigits = Math.round(ohms / 10 ** exponent);
  const first = Math.floor(twoDigits / 10);
  const second = twoDigits % 10;
  const multiplier = exponent >= 0 ? DIGITS[exponent] : exponent === -1 ? GOLD : SILVER;
  return [DIGITS[first], DIGITS[second], multiplier, GOLD];
}
