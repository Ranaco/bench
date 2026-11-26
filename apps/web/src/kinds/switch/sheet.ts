import { SLIDE_SWITCH, type SwitchSpec } from '@bench/engine';
import { field, type SpecSheet } from '../sheet';

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

export { switchSheet };

export const SLIDE_SWITCH_SHEET = switchSheet(SLIDE_SWITCH, 'EG1218', 'SPDT slide switch, non-shorting', 'Drawing P040040 rev C, 10/30/07');
