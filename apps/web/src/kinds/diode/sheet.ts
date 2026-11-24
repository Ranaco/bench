import { THERMAL_VOLTAGE, VISHAY_1N4007 } from '@bench/engine';
import { field, type SpecSheet } from '../sheet';

/** The forward voltage the model gives at 1 A: the junction's drop plus the series resistance's. */
const VOLTS_AT_1A =
  VISHAY_1N4007.ideality * THERMAL_VOLTAGE * Math.log1p(1 / VISHAY_1N4007.saturationAmps) + 1 * VISHAY_1N4007.seriesOhms;

export const DIODE_SHEET: SpecSheet = {
  maker: 'Vishay',
  model: '1N4007',
  description: 'General purpose plastic rectifier, 1 A, DO-41. Its datasheet lists freewheeling diodes among its uses.',
  document: 'Datasheet 88503, revision 29-Apr-2020; SPICE model www.vishay.com/docs/89789/1n4007.txt',
  sections: [
    {
      title: 'Model',
      fields: [
        field('Saturation current', VISHAY_1N4007.saturationAmps, 'nA', 1e-9, 'datasheet', 'IS, from Vishay’s SPICE model: what sets the voltage it turns on at.', 'IS'),
        field('Ideality', VISHAY_1N4007.ideality, '', 1, 'datasheet', 'N, from the same model: how gently its current climbs with voltage.', 'N'),
        field('Series resistance', VISHAY_1N4007.seriesOhms, 'mΩ', 1e-3, 'datasheet', 'RS, from the same model: its leads and silicon.', 'RS'),
        field('Forward voltage at 1 A', VOLTS_AT_1A, 'V', 1, 'worked-out', 'From the three numbers above. The datasheet allows up to 1.1 V.', 'VF'),
      ],
    },
    {
      title: 'Limits (warned, not simulated)',
      fields: [
        field('Average forward current', VISHAY_1N4007.ratedAmps, 'A', 1, 'datasheet', 'At 75 °C, with 9.5 mm leads.', 'IF(AV)'),
        field('Reverse voltage', VISHAY_1N4007.maxReverseVolts, 'V', 1, 'datasheet', 'The most it blocks, repeatedly.', 'VRRM'),
      ],
    },
  ],
};
