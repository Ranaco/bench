import { Segmented } from '../../components/Segmented';
import { CapacitorSymbol } from '../simple-symbols';
import { ChargePane } from './graph';
import { formatSI } from '../../format';
import { amps, volts, type KindView } from '../view';
import { CAPACITOR_VALUES, capacitorSpec } from './model';
import { capacitorSheet } from './sheet';

export const capacitorView: KindView = {
  Controls: ({ part, onProp }) => (
    <Segmented
      label="Capacitance"
      options={CAPACITOR_VALUES.map((uf) => ({ value: String(uf), label: String(uf), detail: 'µF' }))}
      value={String(Math.round(capacitorSpec(part.props).farads * 1e6))}
      onChange={(uf) => {
        onProp(part.id, 'uf', Number(uf));
      }}
    />
  ),
  rows: (part, reading) => {
    const cap = reading.capacitor;
    if (!cap) return [];
    const flowing = reading.amps ?? 0;
    const spec = capacitorSpec(part.props);
    return [
      ['Holding', volts(cap.held)],
      [flowing >= 0 ? 'Current in, filling it' : 'Current out, emptying it', amps(Math.abs(flowing))],
      // ½ × C × V²: what it took to charge it, and what it can give back.
      ['Energy stored', formatSI(0.5 * cap.farads * cap.held ** 2, 'J', { digits: 3 })],
      ['Leak across it, the worst allowed', formatSI(spec.ratedVolts / spec.leakAmps, 'Ω', { digits: 3 })],
      ['Rated for', formatSI(cap.ratedVolts, 'V', { trim: true })],
    ];
  },
  overWarning: (_part, reading) =>
    reading.capacitor?.reversed
      ? 'Charged the wrong way round: minus is above plus. An electrolytic’s insulating layer only works one way, which is why it has a pressure relief vent for when things go wrong. The datasheet gives no numbers for it, so Bench only warns.'
      : `Charged past its ${String(reading.capacitor?.ratedVolts ?? 0)} V rating.`,
  sheet: capacitorSheet,
  in3d: true,
  Graph: ChargePane,
  graphRank: 2,
  // Rounded: 0.0022 F × 1e6 is 2199.9999999999995 in floating point.
  Symbol: CapacitorSymbol,
  label: (part) => [part.label, `${String(Math.round(capacitorSpec(part.props).farads * 1e6))} µF`],
};
