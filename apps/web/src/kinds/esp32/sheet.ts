import { ESP32_GPIO } from '@bench/engine';
import { field, type SpecSheet } from '../sheet';

/** The ESP32's pins: Espressif's DC characteristics, the numbers your pin model is written from. */
const ESP32_SHEET: SpecSheet = {
  maker: 'Espressif',
  model: 'ESP32-DevKitC V4',
  description: 'A development board: the ESP32 chip on a WROOM-32E module, powered from USB through a 3.3 V regulator. Bench models its pins.',
  document: 'ESP32 Series Datasheet v5.3: Table 5-2 (supply) and Table 5-3 (DC characteristics, at 3.3 V and 25 °C)',
  sections: [
    {
      title: 'Supply',
      fields: [
        field('Supply', ESP32_GPIO.supplyVolts, 'V', 1, 'datasheet', 'Typical; the board’s regulator makes it from USB. Bench’s stays at 3.3 V whatever it supplies.', 'VDD'),
      ],
    },
    {
      title: 'Reading a pin',
      fields: [
        field('HIGH at or above', ESP32_GPIO.highAbove, 'V', 1, 'datasheet', '0.75 × VDD.', 'VIH'),
        field(
          'LOW at or below',
          ESP32_GPIO.lowBelow,
          'V',
          1,
          'datasheet',
          '0.25 × VDD. Between the two a real chip could read either; Bench reads the nearer side, and the Serial Monitor says so.',
          'VIL',
        ),
        field(
          'Leak, at most',
          ESP32_GPIO.leakAmps,
          'nA',
          1e-9,
          'datasheet',
          'In or out of a pin that’s reading. Through a big enough resistance, even this much can move the pin anywhere: it floats.',
          'IIH, IIL',
        ),
        field('Pull-up and pull-down', ESP32_GPIO.pullOhms, 'kΩ', 1e3, 'datasheet', 'Typical: what INPUT_PULLUP and INPUT_PULLDOWN switch in.', 'RPU, RPD'),
      ],
    },
    {
      title: 'Driving a pin (OUTPUT)',
      fields: [
        field(
          'Current out, driving HIGH',
          ESP32_GPIO.sourceAmps,
          'mA',
          1e-3,
          'datasheet',
          'Typical, with the pin still at 2.64 V or above, at the maximum drive strength: less, down to about 29 mA each, with more pins sourcing at once. Bench warns past it.',
          'IOH',
        ),
        field('Current in, driving LOW', ESP32_GPIO.sinkAmps, 'mA', 1e-3, 'datasheet', 'Typical, with the pin at 0.495 V, at the maximum drive strength. Bench warns past it.', 'IOL'),
        field('Driving HIGH, as a resistance', ESP32_GPIO.highOhms, 'Ω', 1, 'worked-out', '(3.3 − 2.64) V ÷ 40 mA: the drop at the typical current.'),
        field('Driving LOW, as a resistance', ESP32_GPIO.lowOhms, 'Ω', 1, 'worked-out', '0.495 V ÷ 28 mA.'),
      ],
    },
    {
      title: 'Limits (warned, not simulated)',
      fields: [
        field('Most on a pin', ESP32_GPIO.maxVolts, 'V', 1, 'datasheet', 'VDD + 0.3 V, the top of VIH; and no lower than −0.3 V, the bottom of VIL.'),
      ],
    },
  ],
};

export { ESP32_SHEET };
