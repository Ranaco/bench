import type { Props } from '../kind';
import { SUPPLIES, type Supply } from '../../kit';
import { field, type Source, type SpecSheet } from '../sheet';
import { supplyFor } from './model';

function sheetOf(supply: Supply): SpecSheet {
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

const BATTERY_SHEETS = new Map(SUPPLIES.map((supply) => [supply.id, sheetOf(supply)]));

/** A battery's sheet: its supply's. */
export const batterySheet = (props: Props) => BATTERY_SHEETS.get(supplyFor(props.supply).id);
