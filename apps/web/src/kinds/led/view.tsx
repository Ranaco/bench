import { RED_LED } from '@bench/engine';
import { LedSymbol } from './symbol';
import { LedGraph } from './graph';
import { formatSI } from '../../format';
import { amps, nameOnly, volts, watts, type KindView } from '../view';
import { LED_SHEET } from './sheet';

export const ledView: KindView = {
  rows: (_part, reading) => [
    ['Current through it', amps(reading.amps)],
    ['Across it', volts(reading.volts)],
    ['Turning into heat and light', watts(reading.watts)],
    ...(reading.celsius === undefined ? [] : [['Junction', `${reading.celsius.toFixed(1)} °C`] as const]),
  ],
  overWarning: () => `Over its ${formatSI(RED_LED.maxAmps, 'A', { trim: true })} rating: it’s heating up.`,
  sheet: () => LED_SHEET,
  Graph: LedGraph,
  graphRank: 1,
  Symbol: LedSymbol,
  label: nameOnly,
};
