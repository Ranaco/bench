import type { AdcUnit } from '@bench/engine';

/**
 * The ESP32-DevKitC V4's pins on Bench's board: a handful of its 38, in the same order down each side as on the real
 * board (3V3, then GPIO34, 32 and 33 down the left; GPIO21, 19, 18, 5, 4 and 2 down the right), with a GND at the
 * foot of each. Which pins can analogRead(), and on which converter, and which can only read, are from the ESP32
 * datasheet v5.3 (its pin table; "GPIO pins 34-39 are input-only").
 */
export interface Esp32Pin {
  readonly id: string;
  /** What the board's silkscreen calls it. */
  readonly name: string;
  /** Its GPIO number, for a GPIO. */
  readonly gpio?: number;
  /** The converter analogRead() uses on it, if it has one. */
  readonly adc?: AdcUnit;
  /** Input only: no output driver, no pull-up or pull-down. */
  readonly inputOnly?: boolean;
  readonly x: number;
  readonly y: number;
}

export const ESP32_PINS: readonly Esp32Pin[] = [
  { id: 'v3', name: '3V3', x: -100, y: -60 },
  { id: 'gpio34', name: 'GPIO34', gpio: 34, adc: 1, inputOnly: true, x: -100, y: -20 },
  { id: 'gpio32', name: 'GPIO32', gpio: 32, adc: 1, x: -100, y: 0 },
  { id: 'gpio33', name: 'GPIO33', gpio: 33, adc: 1, x: -100, y: 20 },
  { id: 'gnd', name: 'GND', x: -100, y: 60 },
  { id: 'gpio21', name: 'GPIO21', gpio: 21, x: 100, y: -60 },
  { id: 'gpio19', name: 'GPIO19', gpio: 19, x: 100, y: -40 },
  { id: 'gpio18', name: 'GPIO18', gpio: 18, x: 100, y: -20 },
  { id: 'gpio5', name: 'GPIO5', gpio: 5, x: 100, y: 0 },
  { id: 'gpio4', name: 'GPIO4', gpio: 4, adc: 2, x: 100, y: 20 },
  { id: 'gpio2', name: 'GPIO2', gpio: 2, adc: 2, x: 100, y: 40 },
  { id: 'gnd2', name: 'GND', x: 100, y: 60 },
];

/** The GPIOs alone. */
export const ESP32_GPIOS = ESP32_PINS.filter((p): p is Esp32Pin & { gpio: number } => p.gpio !== undefined);

/** Which converter each analog-capable GPIO is on, for analogRead(). */
export const ESP32_ADC: Readonly<Partial<Record<number, AdcUnit>>> = Object.fromEntries(
  ESP32_GPIOS.flatMap((p) => (p.adc ? [[p.gpio, p.adc]] : [])),
);

/** The body's half-width and half-height, inside the pins' leads. */
export const ESP32_BODY = { halfX: 80, halfY: 80 };
