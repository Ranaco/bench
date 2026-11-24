import { useSyncExternalStore } from 'react';
import type { PlacedPart } from '../../builder/board';
import type { BoardSim } from '../../sim';

/** How much slower the shaft is drawn than it turns: at full speed it turns 215 times a second, far past a screen's. */
const DRAWN_SLOWER = 100;

/** Its shaft, turning (slowed down to be seen), and the area that holds it still while pressed. */
export function Shaft({ part, sim }: { readonly part: PlacedPart; readonly sim: BoardSim }) {
  const turns = useSyncExternalStore(sim.subscribe, () => sim.getSnapshot().parts[part.id]?.motor?.turns ?? 0);
  const degrees = ((turns / DRAWN_SLOWER) % 1) * 360;
  return (
    <>
      <path className="symbol motor-shaft" d="M0,-24 V-18" transform={`rotate(${String(degrees)})`} />
      <circle className="actuator-hit" data-actuator={part.id} r="12">
        <title>Hold to stop its shaft</title>
      </circle>
    </>
  );
}
