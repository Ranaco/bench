import { UVR_25V, type ElectrolyticSpec } from '@bench/engine';
import type { Props } from '../kind';
import { field, type SpecSheet } from '../sheet';
import { CAPACITOR_VALUES, capacitorSpec } from './model';

/** Part numbers from the UVR dimensions table, 25 V row. */
const UVR_PART_NUMBERS: Readonly<Record<(typeof CAPACITOR_VALUES)[number], string>> = {
  220: 'UVR1E221MPD',
  330: 'UVR1E331MPD',
  470: 'UVR1E471MPD',
  1000: 'UVR1E102MPD',
  2200: 'UVR1E222MHD',
};

function sheetOf(spec: ElectrolyticSpec, partNumber: string): SpecSheet {
  const microfarads = Math.round(spec.farads * 1e6); // 0.0022 × 1e6 is 2199.9999999999995 in floating point
  const leakOhms = spec.ratedVolts / spec.leakAmps;
  const kilohms = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 }).format(leakOhms / 1000);
  return {
    maker: 'Nichicon',
    model: partNumber,
    description: `Radial aluminium electrolytic, ${String(microfarads)} µF, 25 V (UVR series)`,
    document: 'UVR series, CAT.8100M',
    sections: [
      {
        title: 'Capacitance',
        fields: [
          field('Capacitance', spec.farads, 'µF', 1e-6, 'datasheet', '±20 % at 120 Hz: Bench uses the nominal value.', 'C'),
          field('Most it may be charged to', spec.ratedVolts, 'V', 1, 'datasheet', 'Rated voltage, DC. Its leads are marked + and −: it only works one way round.'),
        ],
      },
      {
        title: 'Leak',
        fields: [
          field(
            'Most it may leak',
            spec.leakAmps,
            'µA',
            1e-6,
            'datasheet',
            `After 2 minutes at its rated voltage, at 20 °C (0.01 × µF × V). Bench treats it as a resistance across the capacitor, worked out at that voltage: ${String(spec.ratedVolts)} V ÷ this = ${kilohms} kΩ, the worst it may be. A real one usually leaks less.`,
            'I',
          ),
        ],
      },
      {
        title: 'Losses (shown, not simulated)',
        fields: [
          field('Loss at 120 Hz', spec.tanDelta, '', 1, 'datasheet', 'The most allowed. It matters for fast, repeated charging; nothing here is fast enough for it to show.', 'tan δ'),
          field('Ripple current it’s rated for', spec.rippleAmps, 'mA', 1e-3, 'datasheet', 'At 85 °C and 120 Hz, rms.'),
        ],
      },
      {
        title: 'Size',
        fields: [
          field('Case, across', spec.diameterMm, 'mm', 1, 'datasheet', 'φD; up to 0.5 mm more.', 'φD'),
          field('Case, long', spec.lengthMm, 'mm', 1, 'datasheet', spec.lengthMm < 20 ? '±1.5 mm.' : '±2 mm.', 'L'),
          field('Between the leads', spec.leadSpacingMm, 'mm', 1, 'datasheet', '±0.5 mm.', 'P'),
          field('Lead, across', spec.leadDiameterMm, 'mm', 1, 'datasheet', '', 'φd'),
        ],
      },
    ],
  };
}

const CAPACITOR_SHEETS = new Map(CAPACITOR_VALUES.map((uf) => [uf, sheetOf(UVR_25V[uf], UVR_PART_NUMBERS[uf])]));

/** A capacitor's sheet: its UVR row's. */
export function capacitorSheet(props: Props): SpecSheet | undefined {
  const microfarads = Math.round(capacitorSpec(props).farads * 1e6);
  return CAPACITOR_SHEETS.get(CAPACITOR_VALUES.find((uf) => uf === microfarads) ?? 1000);
}
