import { FAULHABER_1516_009SR } from '@bench/engine';
import { formatSI } from '../../format';
import { MotorSymbol } from '../simple-symbols';
import { amps, volts, type KindView } from '../view';
import { MOTOR_SHEET } from './sheet';
import { Shaft } from './shaft';

const rpm = (value: number) => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.abs(value))} rpm`;

export const motorView: KindView = {
  Controls: ({ part, reading, holds, onHold }) => (
    <div className="notice-row">
      <p>{reading?.motor?.held ? 'Held still: a finger on its shaft.' : 'Free to turn.'}</p>
      <button
        type="button"
        className="ghost"
        aria-pressed={holds.has(part.id)}
        onClick={() => {
          onHold(part.id, !holds.has(part.id));
        }}
      >
        {holds.has(part.id) ? 'Let go' : 'Hold its shaft'}
      </button>
    </div>
  ),
  state: (reading) => {
    const m = reading.motor;
    if (!m) return undefined;
    if (m.held) return (reading.amps ?? 0) > FAULHABER_1516_009SR.ratedAmps ? 'Held still: all it draws turns to heat, more than it can take for long' : 'Held still';
    return Math.abs(m.rpm) < 1 ? 'Stopped' : 'Turning';
  },
  rows: (_part, reading) => {
    const m = reading.motor;
    return [
      ['Current through it', amps(reading.amps)],
      ['Across it', volts(reading.volts)],
      ...(m
        ? ([
            ['Speed', rpm(m.rpm)],
            ['Pushing back as it turns', volts(m.backEmf)],
          ] as const)
        : []),
      ['Rated for', `${formatSI(FAULHABER_1516_009SR.ratedAmps, 'A', { trim: true })} for good · ${rpm(FAULHABER_1516_009SR.maxRpm)}`],
    ];
  },
  overWarning: () => `Turning faster than it’s built to (${rpm(FAULHABER_1516_009SR.maxRpm)}).`,
  sheet: () => MOTOR_SHEET,
  Symbol: MotorSymbol,
  label: (part) => [part.label, '1516 SR'],
  Actuator: Shaft,
};
