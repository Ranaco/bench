import {
  awgArea,
  conductorOhms,
  COPPER,
  ENERGIZER_522,
  ENERGIZER_E91,
  Led,
  sweep,
  type IvPoint,
} from '@bench/engine';

/** The parts box: what every lesson and Build mode pick from. */

export interface Supply {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  /** Its push with nothing connected, V. */
  readonly volts: number;
  /** Resistance inside it (and its cable), Ω. */
  readonly ohms: number;
}

/**
 * A USB port's 5 V reaches the board through a cable: here 1 m with 28 AWG copper for its power and
 * ground wires (common in charging cables), so its resistance is worked out from copper, not guessed.
 * The port's own small output resistance isn't included.
 */
export const USB_CABLE_OHMS = 2 * conductorOhms(COPPER, 1, awgArea(28), 25);

export const SUPPLIES: readonly Supply[] = [
  { id: 'aa', label: '3 V', detail: '2 × AA', volts: 2 * ENERGIZER_E91.volts, ohms: 2 * ENERGIZER_E91.ohms },
  { id: 'usb', label: '5 V', detail: 'USB', volts: 5, ohms: USB_CABLE_OHMS },
  { id: '9v', label: '9 V', detail: '9 V battery', ...ENERGIZER_522 },
];

/** The values in a beginner's resistor kit (the E6 series), after 0: a plain jumper wire instead of a resistor. */
export const RESISTOR_STOPS: readonly number[] = [
  0,
  ...[10, 100, 1000, 10000].flatMap((decade) => [1, 1.5, 2.2, 3.3, 4.7, 6.8].map((m) => Math.round(m * decade))),
  100000,
];

/** Points read off the Kingbright WP7113ID datasheet's "forward current vs. forward voltage" graph. */
export const DATASHEET_POINTS: readonly IvPoint[] = [
  [1.6, 0.3],
  [1.63, 0.6],
  [1.7, 2],
  [1.78, 4],
  [1.875, 8],
  [1.89, 10],
  [1.93, 12.4],
  [1.955, 15],
  [2.0, 20],
].map(([volts, milliamps]) => ({ volts, amps: milliamps / 1000 }));

/** The faintest current the LED datasheet's graph plots: below it, there's nothing on record to see. */
export const GLOW_AMPS = Math.min(...DATASHEET_POINTS.map((p) => p.amps));

/** Measures the LED model across 0–3 V, or undefined while it isn't written. */
export function measureLed(): IvPoint[] | undefined {
  try {
    return sweep((a, b) => new Led('D1', a, b), 0, 3, 150);
  } catch {
    return undefined; // A model with a bug shows its error elsewhere; the graph just leaves it out.
  }
}
