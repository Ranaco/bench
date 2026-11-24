import { KNOB_10K } from '@bench/engine';
import { KnobDial, KnobIcon, KnobSymbol, KnobWiper } from './symbol';
import { formatSI } from '../../format';
import { KnobControl } from './controls';
import { amps, volts, watts, type KindView } from '../view';
import { KNOB_DIAL, turnOf } from './model';
import { KNOB_SHEET } from './sheet';

export const knobView: KindView = {
  Controls: ({ part, onProp }) => (
    <KnobControl
      turn={turnOf(part.props)}
      onChange={(turn) => {
        onProp(part.id, 'turn', turn);
      }}
    />
  ),
  rows: (_part, reading) => {
    const knob = reading.knob;
    if (!knob) return [];
    return [
      ['Pin 1 to the wiper', `${formatSI(knob.legs[0], 'Ω', { digits: 3 })} · ${volts(knob.volts[0])}`],
      ['Wiper to pin 3', `${formatSI(knob.legs[1], 'Ω', { digits: 3 })} · ${volts(knob.volts[1])}`],
      ['Current out of the wiper', amps(knob.wiperAmps)],
      ['Turning into heat', watts(reading.watts)],
      ['Rated for', formatSI(KNOB_10K.ratedWatts, 'W', { trim: true })],
    ];
  },
  overWarning: () =>
    `Over its ${formatSI(KNOB_10K.ratedWatts, 'W', { trim: true })} rating: a carbon track run this hot wears and chars. The datasheet has no heat data, so Bench only warns.`,
  sheet: () => KNOB_SHEET,
  in3d: true,
  Symbol: KnobSymbol,
  Icon: KnobIcon,
  label: (part) => [part.label, '10 kΩ'],
  // Its wiper and dial, turned to where it's set, and the area that turns it.
  Actuator: ({ part }) => {
    const turn = turnOf(part.props);
    return (
      <>
        <KnobWiper turn={turn} />
        <KnobDial turn={turn} />
        <rect className="actuator-hit" data-actuator={part.id} x={KNOB_DIAL.x - 20} y={KNOB_DIAL.y - 18} width="40" height="36" rx="8">
          <title>Drag up or right to turn it towards pin 3, down or left towards pin 1</title>
        </rect>
      </>
    );
  },
};
