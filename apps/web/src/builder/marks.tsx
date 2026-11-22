import type { KeyboardEvent } from 'react';
import type { Point } from '../geometry';

/** Small marks drawn on the board: a burn-out, and the button to replace what burnt. */

function activate(action: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };
}

/** A flash, then a few puffs of smoke. */
export function Burst({ at }: { readonly at: Point }) {
  return (
    <g className="burst" aria-hidden="true" transform={`translate(${String(at.x)} ${String(at.y)})`}>
      <circle className="flash" r="26" />
      <circle className="puff" r="7" />
      <circle className="puff" r="9" />
      <circle className="puff" r="6" />
    </g>
  );
}

export function ReplaceButton(props: { readonly at: Point; readonly label: string; readonly onPress: () => void }) {
  const { at, label, onPress } = props;
  return (
    <g
      className="pill"
      role="button"
      tabIndex={0}
      aria-label={label}
      transform={`translate(${String(at.x)} ${String(at.y)})`}
      onClick={onPress}
      onKeyDown={activate(onPress)}
    >
      <rect width="76" height="26" rx="13" />
      <text x="38" y="17.5" textAnchor="middle">
        Replace
      </text>
    </g>
  );
}
