import { TB6612FNG as T } from '@bench/engine';
import { field, type SpecSheet } from '../sheet';

export const DRIVER_SHEET: SpecSheet = {
  maker: 'Toshiba',
  model: 'TB6612FNG',
  description:
    'A driver for two small DC motors: per motor, an H-bridge of four switches, a diode beside each, and the logic that sets them from three pins. Logic from 2.7 to 5.5 V, so an ESP32’s 3.3 V runs it.',
  document: 'TB6612FNG datasheet, 2008-05-09 edition (Toshiba’s reissue is dated 2026-05-13)',
  sections: [
    {
      title: 'Supplies',
      fields: [
        field('Motor supply, lowest', T.minMotorVolts, 'V', 1, 'datasheet', 'Operating range, p.3.', 'VM'),
        field('Motor supply, highest', T.maxMotorVolts, 'V', 1, 'datasheet', '15 V at the absolute most. Bench warns past 13.5.', 'VM'),
        field('Logic supply, lowest', T.minLogicVolts, 'V', 1, 'datasheet', 'The ESP32’s 3V3 pin is enough.', 'VCC'),
        field('Logic supply, highest', T.maxLogicVolts, 'V', 1, 'datasheet', 'Bench warns past it.', 'VCC'),
        field('Logic shuts off below', T.lockoutVolts, 'V', 1, 'datasheet', 'A designed value; on again above 2.2 V. The sheet doesn’t say which supply: Bench watches VCC.', 'UVLD'),
      ],
    },
    {
      title: 'Inputs',
      fields: [
        field('HIGH from', T.highShare, '% of VCC', 0.01, 'datasheet', 'At 3.3 V, anything over 2.31 V.', 'VIH'),
        field('LOW up to', T.lowShare, '% of VCC', 0.01, 'datasheet', 'Between the two, it keeps what it read last.', 'VIL'),
        field('Pull-down on each', T.pullDownOhms, 'kΩ', 1e3, 'datasheet', 'So an unwired input reads LOW.'),
      ],
    },
    {
      title: 'Outputs',
      fields: [
        field('One switch, on', T.switchOhms, 'Ω', 1, 'estimate', 'The sheet gives an upper and a lower switch together, 0.5 Ω typical. Bench splits it evenly.'),
        field('Current per motor', T.ratedAmps, 'A', 1, 'datasheet', 'Average, absolute maximum. 3.2 A for one 10 ms pulse. Bench warns past 1.2 A.', 'IOUT'),
        field('Diode drop at 1 A', 1, 'V', 1, 'datasheet', 'The regenerative diodes beside the switches: they catch a motor’s kick.', 'VF'),
      ],
    },
  ],
};
