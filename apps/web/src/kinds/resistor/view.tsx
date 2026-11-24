import { formatSI } from '../../format';
import { ResistorSymbol } from '../simple-symbols';
import { ResistorPicker } from './controls';
import { amps, volts, watts, type KindView } from '../view';
import { RESISTOR_SHEET } from './sheet';

export const resistorView: KindView = {
  Controls: ({ part, onProp }) => (
    <ResistorPicker
      ohms={Number(part.props.ohms)}
      onChange={(ohms) => {
        onProp(part.id, 'ohms', ohms);
      }}
    />
  ),
  rows: (_part, reading) => [
    ['Current through it', amps(reading.amps)],
    ['Across it', volts(reading.volts)],
    ['Turning into heat', watts(reading.watts)],
    ...(reading.celsius === undefined ? [] : [['Body', `${reading.celsius.toFixed(1)} °C`] as const]),
  ],
  overWarning: () => 'Hotter than it’s rated to run.',
  sheet: () => RESISTOR_SHEET,
  Symbol: ResistorSymbol,
  label: (part) => [part.label, formatSI(Number(part.props.ohms), 'Ω', { trim: true })],
};
