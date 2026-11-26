import { useSyncExternalStore } from 'react';
import type { PlacedPart } from '../../builder/board';
import { useSession } from '../../builder/session';
import { ChargeGraph } from '../../components/ChargeGraph';
import { supplyFor } from '../battery/model';
import { TRACE_SECONDS } from './model';

/** A capacitor's voltage over the last TRACE_SECONDS: filling, holding, emptying. */
export function ChargePane({ chosen }: { readonly chosen: PlacedPart }) {
  const { board, sim } = useSession();
  const snapshot = useSyncExternalStore(sim.subscribe, sim.getSnapshot);
  const trace = sim.trace(chosen.id);
  const batteries = board.parts.filter((p) => p.kind === 'battery').map((p) => supplyFor(p.props.supply).volts);
  const written = snapshot.parts[chosen.id]?.written !== false;
  return (
    <div className="pane pane-scroll graph-pane">
      <p className="pane-note">
        {written
          ? `${chosen.label}’s voltage over the last ${String(TRACE_SECONDS)} seconds. Click an LED to graph it instead.`
          : `${chosen.label} isn’t in the circuit until your capacitor is written.`}
      </p>
      <ChargeGraph
        times={trace?.times ?? []}
        volts={trace?.volts ?? []}
        now={snapshot.time}
        span={TRACE_SECONDS}
        supply={batteries.length > 0 ? Math.max(...batteries) : undefined}
      />
      <p className="graph-note">
        Charging, it climbs fast, then slower and slower: the fuller it is, the less push is left to fill it. Filling
        from empty through a resistor, with nothing else on it, it reaches the dotted 63 % line in resistance ×
        capacitance seconds.
      </p>
    </div>
  );
}
