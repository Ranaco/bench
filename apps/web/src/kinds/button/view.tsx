import { TACT_SWITCH } from '@bench/engine';
import { ButtonSymbol, ButtonIcon } from './symbol';
import { switchSheet } from '../switch/sheet';
import { Cap } from './controls';
import { amps, nameOnly, rating, volts, type KindView } from '../view';

const SHEET = switchSheet(TACT_SWITCH, 'TL1105', '6 mm tact switch: the push button', 'Datasheet dated 2.28.2018');

export const buttonView: KindView = {
  Controls: ({ part, reading, holds, onHold }) => (
    <div className="notice-row">
      <p>{reading?.closed ? 'Held down: its contacts touch.' : 'Up: its contacts are apart.'}</p>
      <button
        type="button"
        className="ghost"
        aria-pressed={holds.has(part.id)}
        onClick={() => {
          onHold(part.id, !holds.has(part.id));
        }}
      >
        {holds.has(part.id) ? 'Let go' : 'Hold down'}
      </button>
    </div>
  ),
  rows: (_part, reading) => [
    ['Current through it', amps(reading.amps)],
    ['Across it', volts(Math.abs(reading.volts))],
    ['Contacts rated for', rating(TACT_SWITCH)],
  ],
  overWarning: () =>
    `More current than its contacts are rated for (${rating(TACT_SWITCH)}). The datasheet doesn’t say how long they’d last, so Bench won’t guess.`,
  sheet: () => SHEET,
  Symbol: ButtonSymbol,
  Icon: ButtonIcon,
  label: nameOnly,
  Actuator: Cap,
};
