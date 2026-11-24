import type { CSSProperties } from 'react';
import { bandsFor } from '../../bands';
import { formatSI } from '../../format';
import { RESISTOR_VALUES } from './model';

/** Picks a value from the kit's resistors, with its colour bands. */
export function ResistorPicker({ ohms, onChange }: { readonly ohms: number; readonly onChange: (ohms: number) => void }) {
  const index = Math.max(0, RESISTOR_VALUES.indexOf(ohms));
  const last = RESISTOR_VALUES.length - 1;
  const bands = bandsFor(ohms);
  const label = formatSI(ohms, 'Ω', { trim: true });
  const fill = { '--fill': `${String((index / last) * 100)}%` } as CSSProperties;
  return (
    <div className="resistor-control">
      <div className="row">
        <span id="picker-label" className="field-label">
          Value
        </span>
        <span className="resistor-value">
          <span className="mini-resistor" title={bands.map((b) => b.name).join(', ')} aria-hidden="true">
            {bands.map((band, i) => (
              <span key={i} style={{ background: band.color }} />
            ))}
          </span>
          <output htmlFor="picker">{label}</output>
        </span>
      </div>
      <input
        id="picker"
        type="range"
        min={0}
        max={last}
        step={1}
        value={index}
        style={fill}
        aria-labelledby="picker-label"
        aria-valuetext={label}
        onChange={(event) => {
          onChange(RESISTOR_VALUES[Number(event.target.value)]);
        }}
      />
    </div>
  );
}
