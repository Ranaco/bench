/**
 * The ESP32's analog-to-digital converter, as Espressif's own driver describes it: ESP-IDF v5.3,
 * components/esp_adc/esp32/adc_cali_line_fitting.c (Apache-2.0).
 *
 * Arduino's analogRead() gives the converter's raw 12-bit number, 0 to 4095, at attenuation 3, the widest of its four
 * ranges: arduino-esp32's esp32-hal-adc.c starts every pin there (`__analogAttenuation = ADC_11db`). The datasheet
 * gives that range as 150 to 2450 mV (ESP32 datasheet v5.3, Table 4-4).
 *
 * The driver's calibration turns a raw number into millivolts: on a straight line up to 2880, and above that, where
 * the converter bends, from two measured lookup tables. Where its line sits depends on the chip's reference voltage,
 * which each chip's eFuse records as a difference from the driver's "ideal" 1100 mV. Bench's chip is exactly ideal,
 * and runs the calibration the other way: for a voltage, the raw number the driver would turn back into it.
 *
 * Real chips aren't all ideal. Uncalibrated, their readings differ by up to ±6% from one chip to another; calibrated
 * with their eFuse reference, they're within ±60 mV over 150 to 2450 mV (datasheet v5.3, section 4.9.1 and Table
 * 4-4). Bench reads as the ideal chip, every time.
 */

/** Which converter a pin is on: ADC1 (GPIO 32 to 39) or ADC2. */
export type AdcUnit = 1 | 2;

/** The driver's "ideal" reference, mV: each chip's eFuse records its own difference from it (in 7 mV steps). */
const VREF = 1100;
const SCALE = 65536;
const STEP = 64;
const LOW_THRESH = 2880;
const HIGH_THRESH = LOW_THRESH + STEP;
const LUT_VREF_LOW = 1000;
const LUT_VREF_HIGH = 1200;
const MAX = 4095;

/** Per unit, at 12 dB: the line's scale and offset, and the lookup tables for 1000 and 1200 mV references. */
const UNITS: Readonly<Record<AdcUnit, { scale: number; offset: number; low: readonly number[]; high: readonly number[] }>> = {
  1: {
    scale: 196602,
    offset: 142,
    low: [2240, 2297, 2352, 2405, 2457, 2512, 2564, 2616, 2664, 2709, 2754, 2795, 2832, 2868, 2903, 2937, 2969, 3000, 3030, 3060],
    high: [2667, 2706, 2745, 2780, 2813, 2844, 2873, 2901, 2928, 2956, 2982, 3006, 3032, 3059, 3084, 3110, 3135, 3160, 3184, 3209],
  },
  2: {
    scale: 197170,
    offset: 128,
    low: [2238, 2293, 2347, 2399, 2451, 2507, 2561, 2613, 2662, 2710, 2754, 2792, 2831, 2869, 2904, 2937, 2968, 2999, 3029, 3059],
    high: [2657, 2698, 2738, 2774, 2807, 2838, 2867, 2894, 2921, 2946, 2971, 2996, 3020, 3043, 3067, 3092, 3116, 3139, 3162, 3185],
  },
};

/** The driver's millivolts for a reading, step for step as its C does (integer arithmetic included). */
export function adcMillivolts(raw: number, unit: AdcUnit): number {
  const u = UNITS[unit];
  const coeffA = Math.floor((VREF * u.scale) / 4096);
  const linear = Math.floor((coeffA * raw + SCALE / 2) / SCALE) + u.offset;
  if (raw < LOW_THRESH) return linear;
  // Bilinear interpolation over the two tables, between the 1000 and 1200 mV curves and between table points.
  const i = Math.floor((raw - LOW_THRESH) / STEP);
  const x2 = LUT_VREF_HIGH - VREF;
  const x1 = VREF - LUT_VREF_LOW;
  const y2 = (i + 1) * STEP + LOW_THRESH - raw;
  const y1 = raw - (i * STEP + LOW_THRESH);
  const at = (curve: readonly number[], k: number) => curve[Math.min(k, curve.length - 1)] ?? 0;
  const sum = at(u.low, i) * x2 * y2 + at(u.high, i) * x1 * y2 + at(u.low, i + 1) * x2 * y1 + at(u.high, i + 1) * x1 * y1;
  const lut = Math.floor((sum + ((LUT_VREF_HIGH - LUT_VREF_LOW) * STEP) / 2) / ((LUT_VREF_HIGH - LUT_VREF_LOW) * STEP));
  if (raw > HIGH_THRESH) return lut;
  // Just past the straight line: eased from it onto the table.
  const x = raw - LOW_THRESH;
  return Math.floor((linear * STEP + lut * x - linear * x + STEP / 2) / STEP);
}

const TABLES = new Map<AdcUnit, number[]>();

function table(unit: AdcUnit): number[] {
  let millivolts = TABLES.get(unit);
  if (!millivolts) {
    millivolts = Array.from({ length: MAX + 1 }, (_, raw) => adcMillivolts(raw, unit));
    TABLES.set(unit, millivolts);
  }
  return millivolts;
}

/** analogRead() for `volts` on a pin: the reading whose millivolts are nearest, 0 below the scale and 4095 above it. */
export function adcReading(volts: number, unit: AdcUnit): number {
  const millivolts = table(unit);
  const mv = volts * 1000;
  if (mv <= (millivolts[0] ?? 0)) return 0;
  if (mv >= (millivolts[MAX] ?? 0)) return MAX;
  // The first reading at or above the voltage, then whichever of it and the one before is nearer.
  let lo = 0;
  let hi = MAX;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((millivolts[mid] ?? 0) < mv) lo = mid + 1;
    else hi = mid;
  }
  const below = millivolts[lo - 1] ?? -Infinity;
  return mv - below <= (millivolts[lo] ?? Infinity) - mv ? lo - 1 : lo;
}
