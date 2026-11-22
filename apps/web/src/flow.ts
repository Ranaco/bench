import { RED_LED } from '@bench/engine';

/** How current is drawn: dots along the wires, and the LED's glow. */

/** Dots speed up with current, on a log scale so microamps and amps both show. */
export function flowSpeed(amps: number): number {
  const size = Math.abs(amps);
  if (size < 1e-6) return 0;
  return Math.sign(amps) * Math.min(260, 40 * Math.log10(size / 1e-6));
}

/** How strongly an LED glows: 0 when dark, 1 at its rated current. */
export function ledGlow(amps: number | undefined, maxAmps = RED_LED.maxAmps): number {
  if (amps === undefined || amps < 20e-6) return 0;
  return Math.min(1, Math.log10(amps / 20e-6) / Math.log10(maxAmps / 20e-6));
}
