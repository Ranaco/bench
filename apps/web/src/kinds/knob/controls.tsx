import { KNOB_10K } from '@bench/engine';
import type { CSSProperties } from 'react';

/** How far a knob is turned, as a slider: left is all the way towards pin 1, right towards pin 3. */
export function KnobControl({ turn, onChange }: { readonly turn: number; readonly onChange: (turn: number) => void }) {
  const degrees = `${String(Math.round(turn * KNOB_10K.turnDegrees))}° of ${String(KNOB_10K.turnDegrees)}°`;
  const fill = { '--fill': `${String(turn * 100)}%` } as CSSProperties;
  return (
    <div className="resistor-control">
      <div className="row">
        <span id="knob-label" className="field-label">
          Turned
        </span>
        <output htmlFor="knob">{degrees}</output>
      </div>
      <input
        id="knob"
        type="range"
        min={0}
        max={1000}
        step={1}
        value={Math.round(turn * 1000)}
        style={fill}
        aria-labelledby="knob-label"
        aria-valuetext={degrees}
        onChange={(event) => {
          onChange(Number(event.target.value) / 1000);
        }}
      />
      <div className="row knob-ends" aria-hidden="true">
        <span>towards pin 1</span>
        <span>towards pin 3</span>
      </div>
    </div>
  );
}
