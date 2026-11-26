/** analogRead(): ESP-IDF's own ESP32 ADC curve at 12 dB (adc_cali_line_fitting.c, v5.3), run backwards. */
import { describe, expect, it } from 'vitest';
import { adcMillivolts, adcReading } from '../../src/index';

describe('the ESP32 ADC, as its driver describes it', () => {
  it('starts at 142 mV on ADC1 and 128 mV on ADC2, the driver’s offsets, and climbs about 0.81 mV a step', () => {
    expect(adcMillivolts(0, 1)).toBe(142);
    expect(adcMillivolts(0, 2)).toBe(128);
    // (1100 mV × 196602 ÷ 4096) ÷ 65536 = 0.8056 per step on ADC1's straight part, less the driver's whole-mV rounding.
    expect((adcMillivolts(2000, 1) - adcMillivolts(1000, 1)) / 1000).toBeCloseTo(0.8056, 2);
  });

  it('climbs all the way to 4095, but for a 1 mV dip where the driver hands over from its line to its table', () => {
    for (const unit of [1, 2] as const) {
      for (let raw = 1; raw <= 4095; raw++) {
        expect(adcMillivolts(raw, unit), `reading ${String(raw)}`).toBeGreaterThanOrEqual(adcMillivolts(raw - 1, unit) - 1);
      }
      expect(adcMillivolts(4095, unit)).toBeGreaterThan(3000);
    }
  });

  it('gives back the reading whose millivolts are nearest the voltage, pinned at 0 and 4095', () => {
    expect(adcReading(0, 1)).toBe(0);
    expect(adcReading(0.1, 1)).toBe(0); // below 142 mV
    expect(adcReading(3.3, 1)).toBe(4095); // past the top of the table
    for (let volts = 0.2; volts < 3; volts += 0.05) {
      const raw = adcReading(volts, 1);
      expect(Math.abs(adcMillivolts(raw, 1) - volts * 1000), `${volts.toFixed(2)} V`).toBeLessThanOrEqual(
        Math.max(1, adcMillivolts(Math.min(raw + 1, 4095), 1) - adcMillivolts(raw, 1)),
      );
    }
  });

  it('reads half of 3.3 V as about 1870', () => {
    // (1650 − 142) mV ÷ 0.8056 mV a step.
    expect(adcReading(1.65, 1)).toBeGreaterThan(1865);
    expect(adcReading(1.65, 1)).toBeLessThan(1875);
  });
});
