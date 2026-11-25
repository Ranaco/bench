import { TB6612FNG } from '@bench/engine';
import { formatSI } from '../../format';
import type { ChannelReading } from '../../sim/readings';
import { amps, nameOnly, volts, type KindView } from '../view';
import { DRIVER_SHEET } from './sheet';
import { DriverSymbol } from './symbol';

/** What a channel is doing, in words. */
function doing(channel: ChannelReading): string {
  switch (channel.mode) {
    case 'forward':
      return 'Forward';
    case 'reverse':
      return 'Backwards';
    case 'brake':
      return 'Braking';
    case 'coast':
      return 'Coasting';
    case undefined:
      return `OUT1 ${channel.outputs[0]}, OUT2 ${channel.outputs[1]}`;
  }
}

const limit = (value: number) => formatSI(value, 'V', { trim: true });

export const driverView: KindView = {
  state: (reading) => {
    const d = reading.driver;
    if (!d) return undefined;
    if (!d.powered) return 'Off: nothing on VCC, so its logic can’t run and every output is off';
    if (!d.awake) return 'Asleep: STBY is LOW, so every output is off';
    if (d.uncertain) return 'An input is between LOW and HIGH: the chip keeps what it read there last';
    return 'Awake';
  },
  rows: (_part, reading) => {
    const d = reading.driver;
    return [
      ...(d
        ? ([
            ['Channel A', `${doing(d.channels[0])} · ${amps(d.channels[0].amps)}`],
            ['Channel B', `${doing(d.channels[1])} · ${amps(d.channels[1].amps)}`],
            ['Motor supply (VM)', volts(d.motorVolts)],
            ['Logic supply (VCC)', volts(d.logicVolts)],
          ] as const)
        : []),
      ['Drawn from VM', amps(reading.amps)],
      ['Rated for', `${formatSI(TB6612FNG.ratedAmps, 'A', { trim: true })} a motor · VM up to ${limit(TB6612FNG.maxMotorVolts)}`],
    ];
  },
  overWarning: (_part, reading) => {
    const d = reading.driver;
    if (!d) return undefined;
    if (d.motorVolts > TB6612FNG.maxMotorVolts) return `More on VM than the datasheet allows (${limit(TB6612FNG.maxMotorVolts)}).`;
    if (d.logicVolts > TB6612FNG.maxLogicVolts) return `More on VCC than the datasheet allows (${limit(TB6612FNG.maxLogicVolts)}).`;
    return `More current through a channel than it’s rated for (${formatSI(TB6612FNG.ratedAmps, 'A', { trim: true })} average).`;
  },
  sheet: () => DRIVER_SHEET,
  Symbol: DriverSymbol,
  label: nameOnly, // its symbol already says what it is
};
