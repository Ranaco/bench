import { SLIDE_SWITCH } from '@bench/engine';
import { SwitchIcon, SwitchLever, SwitchSymbol } from './symbol';
import { Segmented } from '../../components/Segmented';
import { amps, nameOnly, rating, volts, type KindView } from '../view';
import { SLIDE_SWITCH_SHEET } from './sheet';

const sideOf = (props: Readonly<Record<string, string | number>>) => (props.side === 'b' ? 'b' : 'a');

export const switchView: KindView = {
  Controls: ({ part, onFlip }) => (
    <Segmented
      label="Slid to"
      options={[
        { value: 'a', label: 'Side A', detail: 'common to A' },
        { value: 'b', label: 'Side B', detail: 'common to B' },
      ]}
      value={sideOf(part.props)}
      onChange={(side) => {
        if (side !== sideOf(part.props)) onFlip(part.id); // the side it's on already: nothing to do
      }}
    />
  ),
  rows: (part, reading, pin) => {
    const open = sideOf(part.props) === 'b' ? 'a' : 'b';
    return [
      [`Current, common to side ${sideOf(part.props).toUpperCase()}`, amps(reading.amps)],
      [`Across the open side, ${open.toUpperCase()}`, volts(Math.abs(pin('common') - pin(open)))],
      ['Contacts rated for', rating(SLIDE_SWITCH)],
    ];
  },
  overWarning: () =>
    `More current than its contacts are rated for (${rating(SLIDE_SWITCH)}). The datasheet doesn’t say how long they’d last, so Bench won’t guess.`,
  sheet: () => SLIDE_SWITCH_SHEET,
  Symbol: SwitchSymbol,
  Icon: SwitchIcon,
  label: nameOnly,
  // Its lever, and the area around it that a click flips.
  Actuator: ({ part }) => (
    <>
      <SwitchLever side={sideOf(part.props)} />
      <rect className="actuator-hit" data-actuator={part.id} x="-26" y="-30" width="52" height="60" rx="8">
        <title>Click to flip</title>
      </rect>
    </>
  ),
};
