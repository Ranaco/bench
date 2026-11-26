import { VISHAY_1N4007 } from '@bench/engine';
import { formatSI } from '../../format';
import { DiodeSymbol } from '../simple-symbols';
import { amps, volts, type KindView } from '../view';
import { DIODE_SHEET } from './sheet';

const RATED = `${formatSI(VISHAY_1N4007.ratedAmps, 'A', { trim: true })} average · ${formatSI(VISHAY_1N4007.maxReverseVolts, 'V', { trim: true })} backwards`;

export const diodeView: KindView = {
  rows: (_part, reading) => [
    ['Current through it, anode to cathode', amps(reading.amps)],
    ['Across it', volts(reading.volts)],
    ['Rated for', RATED],
  ],
  overWarning: () => `More current than its rating (${RATED}). Bench doesn’t model a diode’s heat, so it only warns.`,
  sheet: () => DIODE_SHEET,
  Symbol: DiodeSymbol,
  label: (part) => [part.label, '1N4007'],
};
