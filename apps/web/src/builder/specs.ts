import { KNOB_10K, QUARTER_WATT, RED_LED, SLIDE_SWITCH, TACT_SWITCH, UVR_25V, type ElectrolyticSpec, type SwitchSpec } from '@bench/engine';
import { SUPPLIES, type Supply } from '../kit';
import type { PartKind, PlacedPart } from './board';
import { CAPACITOR_VALUES, capacitorSpec, supplyFor } from './catalog';

/**
 * Spec sheets: the datasheet numbers each part is simulated with, and where
 * each one comes from. Read-only: the numbers are the real parts', taken from
 * the engine's own constants, so a sheet can never disagree with the circuit.
 */

/** Where a number comes from, from most to least certain. */
export type Source = 'datasheet' | 'standard' | 'fitted' | 'worked-out' | 'typical' | 'estimate';

export const SOURCES: Readonly<Record<Source, { readonly label: string; readonly meaning: string }>> = {
  datasheet: { label: 'Datasheet', meaning: 'Printed on the part’s datasheet.' },
  standard: { label: 'Standard', meaning: 'Set by a published standard.' },
  fitted: { label: 'Fitted', meaning: 'Fitted to a graph on the datasheet, so the model matches the real part.' },
  'worked-out': { label: 'Worked out', meaning: 'Calculated from published figures.' },
  typical: { label: 'Typical', meaning: 'Usual for this type of part, but not checked against one datasheet.' },
  estimate: { label: 'Estimate', meaning: 'Not on any datasheet: a reasonable estimate.' },
};

export interface SpecField {
  readonly label: string;
  /** The datasheet's symbol for it, like VF. */
  readonly symbol?: string;
  readonly value: number;
  /** The unit it's shown in. */
  readonly unit: string;
  /** Base units (A, Ω, J/K) per shown unit: 0.001 for mA. */
  readonly scale: number;
  readonly source: Source;
  readonly note: string;
}

export interface SpecSection {
  readonly title: string;
  readonly fields: readonly SpecField[];
}

export interface SpecSheet {
  readonly maker: string;
  readonly model: string;
  readonly description: string;
  /** The document the numbers come from. */
  readonly document: string;
  readonly sections: readonly SpecSection[];
}

const field = (label: string, value: number, unit: string, scale: number, source: Source, note: string, symbol?: string): SpecField => ({
  label,
  value,
  unit,
  scale,
  source,
  note,
  symbol,
});

// Batteries: each supply in the kit is its own sheet, with the same two numbers.
function batterySheet(supply: Supply): SpecSheet {
  const sheet = (maker: string, model: string, description: string, document: string, volts: readonly [Source, string], ohms: readonly [Source, string]): SpecSheet => ({
    maker,
    model,
    description,
    document,
    sections: [
      {
        title: 'Electrical',
        fields: [
          field('Voltage with nothing connected', supply.volts, 'V', 1, volts[0], volts[1], 'V'),
          field('Resistance inside it', supply.ohms, 'Ω', 1, ohms[0], ohms[1], 'R'),
        ],
      },
    ],
  });
  switch (supply.id) {
    case 'aa':
      return sheet(
        'Energizer',
        'E91 × 2',
        'Two AA alkaline cells in series, fresh',
        'E91 datasheet (EBC-1102Q)',
        ['datasheet', '1.5 V a cell, where its light-load test curves start; two cells in series.'],
        ['datasheet', '“150 to 300 milliohms (fresh)” a cell: the middle of that range, twice.'],
      );
    case 'usb':
      return sheet(
        'USB',
        'USB port + cable',
        '5 V from a USB port, through a 1 m cable',
        'The USB standard, and wire maths for the cable',
        ['standard', 'The USB standard’s supply voltage.'],
        [
          'worked-out',
          'The cable’s 28 AWG copper power and ground wires, 1 m each: copper’s resistivity (IEC 60028) × length ÷ cross-section (ASTM B258). The port’s own small output resistance isn’t included.',
        ],
      );
    default:
      return sheet(
        'Energizer',
        '522',
        '9 V alkaline battery, fresh',
        'Engineering data sheet EBC-1108E',
        ['worked-out', 'Its fresh 9.3 V under light loads, plus the little those loads cost inside it.'],
        ['datasheet', 'Typical at 20 °C, fresh. Its chart rises to about 12 Ω as it goes flat.'],
      );
  }
}

const BATTERY_SHEETS = new Map(SUPPLIES.map((supply) => [supply.id, batterySheet(supply)]));

const RESISTOR_SHEET: SpecSheet = {
  maker: 'Any maker',
  model: '¼ W carbon film',
  description: 'The resistor in every starter kit',
  document: 'Typical ratings for the type, not one datasheet',
  sections: [
    {
      title: 'Rating',
      fields: [
        field('Heat it can take, continuously', QUARTER_WATT.ratedWatts, 'W', 1, 'typical', 'Rated up to 70 °C; less above that.', 'P'),
        field('Hottest it’s meant to run', QUARTER_WATT.maxCelsius, '°C', 1, 'typical', 'Its rating falls to nothing here.'),
      ],
    },
    {
      title: 'Heat',
      fields: [
        field('Degrees hotter per watt', QUARTER_WATT.kelvinPerWatt, 'K/W', 1, 'worked-out', '(155 − 70) ÷ 0.25: its rating falls to nothing over those 85 degrees.', 'Rth'),
        field('Energy to warm it one degree', QUARTER_WATT.joulesPerKelvin, 'mJ/K', 1e-3, 'estimate', 'Sets how fast it heats up, not how hot it gets.'),
        field('Where it burns out', QUARTER_WATT.burnCelsius, '°C', 1, 'estimate', 'Where the coating chars and the film breaks, so it fails open.'),
      ],
    },
  ],
};

const LED_SHEET: SpecSheet = {
  maker: 'Kingbright',
  model: 'WP7113ID',
  description: '5 mm high-efficiency red LED',
  document: 'Datasheet V.14A, January 2026',
  sections: [
    {
      title: 'Electrical',
      fields: [
        field('Voltage across it', RED_LED.forwardVolts, 'V', 1, 'datasheet', 'Typical, at the test current below.', 'VF'),
        field('Test current', RED_LED.typicalAmps, 'mA', 1e-3, 'datasheet', 'The current the datasheet quotes VF at.', 'IF'),
        field('Most current, continuously', RED_LED.maxAmps, 'mA', 1e-3, 'datasheet', 'Its DC forward current rating. Past it, it heats up.', 'IF max'),
      ],
    },
    {
      title: 'Fitted to its I–V graph',
      fields: [
        field('How gently its curve bends', RED_LED.ideality, '', 1, 'fitted', 'Fitted, with the resistance below, to its forward current vs. forward voltage graph: within about 15 mV.', 'n'),
        field('Resistance inside it', RED_LED.seriesOhms, 'Ω', 1, 'fitted', 'The chip and its bond wire, in series with the diode.', 'Rs'),
      ],
    },
    {
      title: 'Heat',
      fields: [
        field('Degrees hotter per watt, junction to air', RED_LED.kelvinPerWatt, 'K/W', 1, 'datasheet', 'Printed as °C/W: a kelvin and a degree Celsius are the same step.', 'Rth JA'),
        field('Hottest the junction survives', RED_LED.maxJunctionCelsius, '°C', 1, 'datasheet', 'Past this, Bench burns it out at once; a real one dims and wears out first.', 'Tj'),
        field('Energy to warm it one degree', RED_LED.joulesPerKelvin, 'mJ/K', 1e-3, 'estimate', 'Not on the datasheet. Sets how fast it heats up, not how hot it gets.'),
      ],
    },
  ],
};

function switchSheet(spec: SwitchSpec, model: string, description: string, document: string): SpecSheet {
  return {
    maker: 'E-Switch',
    model,
    description,
    document,
    sections: [
      {
        title: 'Contacts',
        fields: [
          field('Resistance while touching', spec.closedOhms, 'mΩ', 1e-3, 'datasheet', 'Contact resistance, the most allowed: Bench uses that.'),
          field('Resistance while apart', spec.openOhms, 'MΩ', 1e6, 'datasheet', 'Insulation resistance, the least allowed: Bench uses that.'),
        ],
      },
      {
        title: 'Rating',
        fields: [
          field('Most current through the contacts', spec.ratedAmps, 'mA', 1e-3, 'datasheet', 'Past it, Bench warns. The datasheet doesn’t say how long they’d last, so Bench doesn’t burn them.'),
          field('…at up to', spec.ratedVolts, 'V', 1, 'datasheet', 'DC.'),
        ],
      },
    ],
  };
}

const KNOB_SHEET: SpecSheet = {
  maker: 'Bourns',
  model: 'PTV09',
  description: '9 mm carbon potentiometer, 10 kΩ, linear taper',
  document: 'PTV09 datasheet, REV. 01/25',
  sections: [
    {
      title: 'Track',
      fields: [
        field('Resistance, end to end', KNOB_10K.totalOhms, 'kΩ', 1e3, 'datasheet', '±20 %: Bench uses the nominal value.'),
        field('Left at each end', KNOB_10K.residualOhms, 'Ω', 1, 'datasheet', 'Printed as “500 ohms or ±1 % max.”: Bench uses 500 Ω, the most it allows. A real one may leave much less.'),
        field('Dead zone at each end', KNOB_10K.deadZone, '%', 0.01, 'datasheet', 'Its linear taper (B0) rises in a straight line from 5 % to 95 % of the turn; outside that the wiper rests on the end.'),
        field('How far it turns', KNOB_10K.turnDegrees, '°', 1, 'datasheet', 'Mechanical angle, ±10°.'),
      ],
    },
    {
      title: 'Rating',
      fields: [
        field('Heat the whole track can take', KNOB_10K.ratedWatts, 'W', 1, 'datasheet', 'Up to 50 °C around it. Past it, Bench warns: the datasheet has no heat data to burn it by.', 'P'),
        field('Most voltage across it', KNOB_10K.ratedVolts, 'V', 1, 'datasheet', 'DC.'),
      ],
    },
  ],
};

/** Part numbers from the UVR dimensions table, 25 V row. */
const UVR_PART_NUMBERS: Readonly<Record<(typeof CAPACITOR_VALUES)[number], string>> = {
  220: 'UVR1E221MPD',
  330: 'UVR1E331MPD',
  470: 'UVR1E471MPD',
  1000: 'UVR1E102MPD',
  2200: 'UVR1E222MHD',
};

function capacitorSheet(spec: ElectrolyticSpec, partNumber: string): SpecSheet {
  const microfarads = spec.farads * 1e6;
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

const CAPACITOR_SHEETS = new Map(CAPACITOR_VALUES.map((uf) => [uf, capacitorSheet(UVR_25V[uf], UVR_PART_NUMBERS[uf])]));

const SHEETS: Partial<Record<PartKind, SpecSheet>> = {
  resistor: RESISTOR_SHEET,
  led: LED_SHEET,
  switch: switchSheet(SLIDE_SWITCH, 'EG1218', 'SPDT slide switch, non-shorting', 'Drawing P040040 rev C, 10/30/07'),
  button: switchSheet(TACT_SWITCH, 'TL1105', '6 mm tact switch: the push button', 'Datasheet dated 2.28.2018'),
  knob: KNOB_SHEET,
};

/** A part's spec sheet, or undefined for parts without one (ground, junctions). */
export function sheetFor(kind: PartKind, props: PlacedPart['props']): SpecSheet | undefined {
  if (kind === 'battery') return BATTERY_SHEETS.get(supplyFor(props.supply).id);
  if (kind === 'capacitor') {
    const microfarads = Math.round(capacitorSpec(props).farads * 1e6);
    return CAPACITOR_SHEETS.get(CAPACITOR_VALUES.find((uf) => uf === microfarads) ?? 1000);
  }
  return SHEETS[kind];
}

/** Shows a value in its field's unit: 0.03 A as "30" (mA). */
export function shown(f: SpecField): string {
  return new Intl.NumberFormat('en-US', { maximumSignificantDigits: 4 }).format(f.value / f.scale);
}
