import { ESP32_GPIO } from '@bench/engine';
import { useSyncExternalStore } from 'react';
import type { PlacedPart } from '../../builder/board';
import { useSession } from '../../builder/session';
import { PinGraph } from '../../components/PinGraph';
import { ESP32_GPIOS } from './board';
import { PIN_TRACE_SECONDS } from './model';

/** The ESP32's wired pins: each one's voltage over the last few seconds, against the lines it's read by. */
export function PinPane({ chosen }: { readonly chosen: PlacedPart }) {
  const { sim, board } = useSession();
  const snapshot = useSyncExternalStore(sim.subscribe, sim.getSnapshot);
  const pins = snapshot.parts[chosen.id]?.chip?.pins;
  const wired = ESP32_GPIOS.filter((p) =>
    board.wires.some((w) => (w.a.part === chosen.id && w.a.pin === p.id) || (w.b.part === chosen.id && w.b.pin === p.id)),
  );
  const rows = wired.map((p) => {
    const trace = sim.pinTrace(chosen.id, p.id);
    const pin = pins?.[p.id];
    const now = !pin
      ? '—'
      : pin.mode === 'output'
        ? pin.high
          ? 'driving HIGH'
          : 'driving LOW'
        : pin.level === 'high'
          ? 'HIGH'
          : pin.level === 'low'
            ? 'LOW'
            : pin.level === 'unknown'
              ? '?'
              : '—';
    const analog = pin?.analog === undefined ? '' : ` · ${String(pin.analog)}`;
    return { name: p.name, times: trace?.times ?? [], volts: trace?.volts ?? [], now: `${now}${analog}` };
  });
  return (
    <div className="pane pane-scroll graph-pane">
      <p className="pane-note">
        {rows.length === 0
          ? `Wire something to one of ${chosen.label}’s GPIO pins to graph it.`
          : `${chosen.label}: each wired pin’s voltage over the last ${String(PIN_TRACE_SECONDS)} seconds. Click a capacitor, an LED or a transistor to graph it instead.`}
      </p>
      {rows.length > 0 && (
        <PinGraph
          rows={rows}
          now={snapshot.time}
          span={PIN_TRACE_SECONDS}
          supply={ESP32_GPIO.supplyVolts}
          highAbove={ESP32_GPIO.highAbove}
          lowBelow={ESP32_GPIO.lowBelow}
        />
      )}
      <p className="graph-note">
        The datasheet promises HIGH at or above 0.75 × 3.3 V and LOW at or below 0.25 × 3.3 V. In the shaded band between,
        a pin could read either: it’s where a floating pin wanders.
      </p>
    </div>
  );
}
