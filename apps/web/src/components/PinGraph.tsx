import { useId } from 'react';
import { useSize } from './useSize';

/** One pin's strip: its name, its voltage over time, and what it reads right now. */
export interface PinRow {
  readonly name: string;
  readonly times: readonly number[];
  readonly volts: readonly number[];
  /** What it reads now, in words: "HIGH", "LOW", "?", or "driving HIGH". */
  readonly now: string;
}

interface PinGraphProps {
  readonly rows: readonly PinRow[];
  /** Circuit time now, s: the right-hand edge. */
  readonly now: number;
  /** How many seconds back the left-hand edge is. */
  readonly span: number;
  /** The supply, and the lines the pins are read against, V. */
  readonly supply: number;
  readonly highAbove: number;
  readonly lowBelow: number;
}

const LEFT = 58;
const RIGHT = 86;
const ROW = 52;
const GAP = 10;
const TOP = 6;
const BOTTOM = 24;

const n = (value: number) => (Math.round(value * 10) / 10).toString();

/**
 * Each pin's voltage over the last few seconds, one strip per pin, as a logic analyser shows them: the band between
 * the two lines, where the datasheet doesn't promise HIGH or LOW, shaded.
 */
export function PinGraph({ rows, now, span, supply, highAbove, lowBelow }: PinGraphProps) {
  const clip = useId();
  const [plot, { width: W }] = useSize();
  const H = TOP + rows.length * (ROW + GAP) - GAP + BOTTOM;
  const top = supply + 0.3;
  const x = (t: number) => LEFT + ((t - (now - span)) / span) * (W - LEFT - RIGHT);
  const yIn = (row: number, volts: number) => TOP + row * (ROW + GAP) + ROW - (Math.min(Math.max(volts, 0), top) / top) * ROW;

  return (
    <figure className="iv pin-graph">
      <div className="iv-plot pin-plot" ref={plot} style={{ minHeight: H }}>
        {W > LEFT + RIGHT && (
          <svg width={W} height={H} viewBox={`0 0 ${String(W)} ${String(H)}`} role="img" aria-label="Each pin's voltage over the last few seconds">
            <defs>
              <clipPath id={clip}>
                <rect x={LEFT} y={0} width={W - LEFT - RIGHT} height={H} />
              </clipPath>
            </defs>
            {rows.map((row, i) => {
              const line = row.times
                .map((t, k) => `${k === 0 ? 'M' : 'L'}${n(x(t))},${n(yIn(i, row.volts[k] ?? 0))}`)
                .join(' ');
              return (
                <g key={row.name}>
                  <rect className="pin-band" x={LEFT} y={yIn(i, highAbove)} width={W - LEFT - RIGHT} height={yIn(i, lowBelow) - yIn(i, highAbove)} />
                  <line className="iv-grid" x1={LEFT} x2={W - RIGHT} y1={yIn(i, 0)} y2={yIn(i, 0)} />
                  <line className="iv-grid" x1={LEFT} x2={W - RIGHT} y1={yIn(i, supply)} y2={yIn(i, supply)} />
                  <text className="iv-label" x={LEFT - 8} y={yIn(i, supply / 2) + 3.5} textAnchor="end">
                    {row.name}
                  </text>
                  <text className="iv-tick" x={W - RIGHT + 6} y={yIn(i, supply) + 3.5}>
                    3.3 V
                  </text>
                  <text className="iv-tick" x={W - RIGHT + 6} y={yIn(i, 0) + 3.5}>
                    0 V
                  </text>
                  <text className="pin-now" x={W - RIGHT + 6} y={yIn(i, supply / 2) + 3.5}>
                    {row.now}
                  </text>
                  <g clipPath={`url(#${clip})`}>{line && <path className="charge-line" d={line} />}</g>
                </g>
              );
            })}
            <text className="iv-label" x={(LEFT + W - RIGHT) / 2} y={H - 6} textAnchor="middle">
              {`the last ${String(span)} seconds`}
            </text>
          </svg>
        )}
      </div>
      <figcaption>
        <span className="key key-band">could read either way: between {lowBelow.toFixed(3)} V and {highAbove.toFixed(3)} V</span>
      </figcaption>
    </figure>
  );
}
