import { PN2222A } from '@bench/engine';
import { TransistorSymbol } from '../simple-symbols';
import { TransistorPane } from './graph';
import { formatSI } from '../../format';
import { amps, volts, watts, type KindView } from '../view';
import { TRANSISTOR_SHEET } from './sheet';

/** A transistor's ratings, as one line: collector current, collector-emitter voltage, heat. */
const LIMITS = [
  formatSI(PN2222A.maxCollectorAmps, 'A', { trim: true }),
  formatSI(PN2222A.maxCollectorVolts, 'V', { trim: true }),
  formatSI(PN2222A.maxWatts, 'W', { trim: true }),
].join(' · ');

/** What a transistor's state means, in a few words. */
const STATE = {
  off: 'Off: nothing into the base, so nothing through',
  amplifying: 'Amplifying: the base current sets the collector’s',
  on: 'Switched fully on: the rest of the circuit sets the current',
} as const;

export const transistorView: KindView = {
  state: (reading) => (reading.transistor?.state && reading.written ? STATE[reading.transistor.state] : undefined),
  rows: (_part, reading) => {
    const q = reading.transistor;
    if (!q) return [];
    return [
      ['Into the base', amps(q.baseAmps)],
      ['Collector to emitter', amps(q.collectorAmps)],
      // The gain only means something while there's base current to divide by, and a collector current to divide.
      ...(q.state !== 'off' && q.collectorAmps !== undefined ? [['Collector ÷ base', `× ${(q.collectorAmps / q.baseAmps).toFixed(0)}`] as const] : []),
      ['Across it, collector to emitter', volts(q.collectorVolts)],
      ['Base to emitter', volts(q.baseVolts)],
      ['Turning into heat', watts(reading.watts)],
      ['Rated for', LIMITS],
    ];
  },
  overWarning: () => `Past what its datasheet allows (${LIMITS}). Bench doesn’t model a transistor’s heat, so it only warns.`,
  sheet: () => TRANSISTOR_SHEET,
  in3d: true,
  Graph: TransistorPane,
  graphRank: 3,
  Symbol: TransistorSymbol,
  label: (part) => [part.label, 'PN2222A'],
};
