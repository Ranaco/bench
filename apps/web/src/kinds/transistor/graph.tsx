import { useMemo, useState, useSyncExternalStore } from 'react';
import type { PlacedPart } from '../../builder/board';
import { useSession } from '../../builder/session';
import { useCode } from '../../code/context';
import { TransistorGraph, type TransistorDot } from '../../components/TransistorGraph';
import { measureTransistor } from '../../measureTransistor';

/** How many places a transistor's trail remembers. */
const TRAIL = 160;

/** Far enough from the last place to be a new one: 1 % of either current, or a tenth of a microamp. */
const moved = (a: TransistorDot, b: TransistorDot) =>
  [
    [a.baseAmps, b.baseAmps],
    [a.collectorAmps, b.collectorAmps],
  ].some(([u, v]) => Math.abs(u - v) > Math.max(1e-7, 0.01 * Math.abs(v)));

/** The selected transistor's two graphs, with where it's been since the graph opened. */
export function TransistorPane({ chosen }: { readonly chosen: PlacedPart }) {
  const { sim } = useSession();
  const snapshot = useSyncExternalStore(sim.subscribe, sim.getSnapshot);
  // Measured from the code this transistor runs: yours, or Bench's.
  const code = useCode();
  const runs = code?.codeFor(chosen).transistor;
  const curve = useMemo(() => measureTransistor(runs), [runs]);
  const [trail, setTrail] = useState<readonly TransistorDot[]>([]);
  const reading = snapshot.parts[chosen.id];
  const q = reading?.written ? reading.transistor : undefined;
  const collectorAmps = q?.collectorAmps;
  const now = q && collectorAmps !== undefined ? { baseVolts: q.baseVolts, baseAmps: q.baseAmps, collectorAmps } : undefined;
  // Somewhere new: remember it (state worked out while rendering, as React allows, rather than in an effect).
  const last = trail.at(-1);
  if (now && (!last || moved(last, now))) setTrail([...trail.slice(1 - TRAIL), now]);

  return (
    <div className="pane pane-scroll graph-pane">
      <p className="pane-note">
        {curve
          ? `${chosen.label}: its collector current against the voltage on its base, then against the current into it. Click an LED or a capacitor to graph it instead.`
          : `${chosen.label} isn’t in the circuit until your transistor’s diodes() and action() are written.`}
      </p>
      <TransistorGraph curve={curve} now={now} trail={trail} />
      <p className="graph-note">
        {now
          ? 'The top one is a diode’s climb: almost nothing until about 0.6 V, then about 48 times more for every 0.1 V. In the bottom one, while it’s amplifying, the dot rides the line, 256 times the base current; fully on, it leaves the line and goes flat, because the rest of the circuit is setting the current, not the base.'
          : 'No dot yet: there’s no collector reading until your transistor’s current() is written.'}
      </p>
    </div>
  );
}
