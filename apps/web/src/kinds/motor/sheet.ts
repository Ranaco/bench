import { FAULHABER_1516_009SR as M } from '@bench/engine';
import { field, type SpecSheet } from '../sheet';

export const MOTOR_SHEET: SpecSheet = {
  maker: 'Faulhaber',
  model: '1516 T 009 SR',
  description:
    'DC micromotor, 15 mm across, precious-metal brushes, 9 V. Its datasheet gives every number a model needs, the winding’s inductance and the rotor’s inertia included; a hobby gear motor’s doesn’t.',
  document: 'Series 1516 … SR datasheet, edition 2026 Jul. 28, the 009 SR column',
  sections: [
    {
      title: 'At its 9 V',
      fields: [
        field('Speed with nothing on its shaft', M.noLoadRpm, 'rpm', 1, 'datasheet', 'Bench’s model reaches about 12 800: the sheet rounds.', 'n0'),
        field('Current with nothing on its shaft', M.noLoadAmps, 'mA', 1e-3, 'datasheet', 'All of it spent on friction.', 'I0'),
        field('Torque held still', M.stallTorque, 'mNm', 1e-3, 'datasheet', 'Its current held still is 9 V ÷ 32.5 Ω, about 277 mA.', 'MH'),
      ],
    },
    {
      title: 'Inside',
      fields: [
        field('Winding resistance', M.ohms, 'Ω', 1, 'datasheet', 'All a held motor is.', 'R'),
        field('Winding inductance', M.henries, 'µH', 1e-6, 'datasheet', 'Why its current can’t stop at once: the kick.', 'L'),
        field('Torque per amp', M.torquePerAmp, 'mNm/A', 1e-3, 'datasheet', 'Also the volts it makes per radian a second: 6.25 mV.', 'kM'),
        field('Friction', M.frictionTorque, 'mNm', 1e-3, 'datasheet', 'Bearings and brushes.', 'MR'),
        field('Rotor inertia', M.inertia, 'g·cm²', 1e-7, 'datasheet', 'How quickly it speeds up and slows down.', 'J'),
        field('Speed per volt', 60 / (2 * Math.PI) / M.torquePerAmp, 'rpm/V', 1, 'worked-out', 'From the torque per amp. The sheet says 1530.', 'kn'),
      ],
    },
    {
      title: 'Limits',
      fields: [
        field('Current for good', M.ratedAmps, 'mA', 1e-3, 'datasheet', 'Its winding’s thermal limit. Held still on 9 V it draws more: fine for a moment, not for long. Bench doesn’t model its heat yet.', 'IN'),
        field('Fastest', M.maxRpm, 'rpm', 1, 'datasheet', 'Bench warns past it.', 'nmax'),
      ],
    },
  ],
};
