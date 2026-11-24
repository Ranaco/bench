import type { ChipPin, ReadoutPin } from '../../sim';
import { Esp32Symbol } from './symbol';
import { PinPane } from './graph';
import { amps, nameOnly, volts, type KindView, type Row } from '../view';
import { ESP32_SHEET } from './sheet';

/** How a pin is set up, in words. */
const MODE_TEXT = { input: 'input', pullup: 'input, pull-up', pulldown: 'input, pull-down', output: 'output' } as const;

/** What a pin reads, in words. */
const LEVEL_TEXT = { high: 'HIGH', low: 'LOW', unknown: '? (could be either)' } as const;

/** A pin that went both ways within one readout: faster than anyone could read HIGH, then LOW. */
const switching = (pin: ChipPin | ReadoutPin) => 'switches' in pin && pin.switches >= 2;

/** What an output pin is doing: driving HIGH or LOW, or switching between them. */
function driving(pin: ChipPin | ReadoutPin): string {
  if ('switches' in pin && switching(pin)) return `switching, HIGH ${String(Math.round(pin.highShare * 100))}% of the time`;
  return pin.high ? 'driving HIGH' : 'driving LOW';
}

export const esp32View: KindView = {
  rows: (_part, reading) => {
    const chip = reading.chip;
    if (!chip) return [];
    // While a program runs, the pins as a multimeter shows them: 4 times a second, averaged in between.
    const shown = chip.readout ?? chip;
    const rows: Row[] = [
      ['3V3 to GND', volts(reading.volts)],
      ['Out of its 3.3 V supply', amps(shown.supplyAmps)],
    ];
    const idle: string[] = [];
    for (const pin of Object.values<ChipPin | ReadoutPin>(shown.pins)) {
      // A plain input nothing holds (bare, or wired to something that doesn't: an open button, an LED that's off):
      // not worth a row of its own.
      if (pin.mode === 'input' && pin.floating) {
        idle.push(`GPIO${String(pin.gpio)}`);
        continue;
      }
      const level = pin.mode === 'output' ? driving(pin) : pin.level ? LEVEL_TEXT[pin.level] : '—';
      const at = pin.floating ? 'floating' : volts(pin.volts);
      const analog = pin.analog === undefined ? '' : ` · analogRead ${String(pin.analog)}`;
      const current = pin.mode === 'input' || pin.amps === undefined ? '' : ` · ${amps(pin.amps)}`;
      const average = switching(pin) ? ' on average' : '';
      // Two lines, always: what it's doing, then the numbers. One line that wraps only sometimes makes the rows
      // below jump each time it changes.
      rows.push([`GPIO${String(pin.gpio)}`, `${MODE_TEXT[pin.mode]} · ${level}\n${at}${analog}${current}${average}`]);
    }
    if (idle.length > 0) rows.push(['Floating inputs', idle.join(', ')]);
    return rows;
  },
  overWarning: () =>
    'A pin is past what the datasheet allows: more than its typical 40 mA out or 28 mA in, or a voltage outside −0.3 to 3.6 V. Bench doesn’t model the damage, so it only warns.',
  sheet: () => ESP32_SHEET,
  in3d: true,
  Graph: PinPane,
  graphRank: 4,
  Symbol: Esp32Symbol,
  label: nameOnly,
};
