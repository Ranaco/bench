import { RED_LED } from '@bench/engine';
import { useMemo, useSyncExternalStore } from 'react';
import type { PlacedPart } from '../../builder/board';
import { useSession } from '../../builder/session';
import { useCode } from '../../code/context';
import { IvGraph } from '../../components/IvGraph';
import { DATASHEET_POINTS, measureLed } from '../../kit';

/** The selected LED's current against its voltage: your model's curve, the datasheet's dots, and where it is now. */
export function LedGraph({ chosen }: { readonly chosen?: PlacedPart }) {
  const { sim } = useSession();
  const snapshot = useSyncExternalStore(sim.subscribe, sim.getSnapshot);
  // Measured from the code this LED runs: yours, or Bench's.
  const code = useCode();
  const runs = chosen && code ? code.codeFor(chosen).led : undefined;
  const curve = useMemo(() => measureLed(runs), [runs]);
  const reading = chosen && snapshot.parts[chosen.id];
  const operating =
    reading?.written && !reading.burnt && reading.amps !== undefined ? { volts: reading.volts, amps: reading.amps } : undefined;

  return (
    <div className="pane pane-scroll graph-pane">
      <p className="pane-note">
        {chosen
          ? `${chosen.label}${reading?.burnt ? ', burnt out' : ''}. Click another LED to graph it instead.`
          : 'Add an LED to see where it settles, or a capacitor to watch it fill.'}
      </p>
      <IvGraph curve={curve} datasheet={DATASHEET_POINTS} operating={operating} maxAmps={RED_LED.maxAmps} />
      <p className="graph-note">
        The line is your LED model, the dots are the real LED read off its datasheet, and the bright dot is where it is
        right now.
      </p>
    </div>
  );
}
