import { Segmented } from '../../components/Segmented';
import { BatterySymbol } from '../simple-symbols';
import { SUPPLIES } from '../../kit';
import { amps, volts, watts, type KindView } from '../view';
import { supplyFor } from './model';
import { batterySheet } from './sheet';

export const batteryView: KindView = {
  Controls: ({ part, onProp }) => (
    <Segmented
      label="Supply"
      options={SUPPLIES.map((s) => ({ value: s.id, label: s.label, detail: s.detail }))}
      value={supplyFor(part.props.supply).id}
      onChange={(id) => {
        onProp(part.id, 'supply', id);
      }}
    />
  ),
  rows: (_part, reading) => [
    ['Current out of +', amps(reading.amps)],
    ['Across its terminals', volts(reading.volts)],
    // What reaches the circuit: whatever its internal resistance burns is already taken off.
    ['Into the circuit', watts(Math.max(0, -reading.watts))],
  ],
  sheet: batterySheet,
  Symbol: BatterySymbol,
  label: (part) => [part.label, supplyFor(part.props.supply).label],
};
