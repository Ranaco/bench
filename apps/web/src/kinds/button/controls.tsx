import { useSyncExternalStore } from 'react';
import type { PlacedPart } from '../../builder/board';
import { ButtonCap } from './symbol';
import type { BoardSim } from '../../sim';

/** Its cap, drawn down while it's held, and the area that presses it. */
export function Cap({ part, sim }: { readonly part: PlacedPart; readonly sim: BoardSim }) {
  const pressed = useSyncExternalStore(sim.subscribe, () => sim.getSnapshot().parts[part.id]?.closed ?? false);
  return (
    <>
      <ButtonCap pressed={pressed} />
      <rect className="actuator-hit" data-actuator={part.id} x="-32" y="-36" width="64" height="34" rx="8">
        <title>Hold to press</title>
      </rect>
    </>
  );
}
