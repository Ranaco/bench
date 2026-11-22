import { useId } from 'react';
import { useSize } from './useSize';

interface ChargeGraphProps {
  /** Circuit time of each sample, s, oldest first. */
  readonly times: readonly number[];
  /** The capacitor's voltage at each. */
  readonly volts: readonly number[];
  /** Circuit time now, s. */
  readonly now: number;
  /** How far back the graph goes, s. */
  readonly span: number;
  /** The biggest battery on the board, V, if there is one: as full as it can charge it. */
  readonly supply: number | undefined;
}

const LEFT = 36;
const RIGHT = 12;
const TOP = 10;
const BOTTOM = 34;

const n = (value: number) => (Math.round(value * 10) / 10).toString();

/** A tidy top for the volts axis: the next whole volt above everything plotted, and at least 1 V. */
function topVolts(highest: number): number {
  return Math.max(1, Math.ceil(highest + 0.25));
}

/**
 * A capacitor's voltage over the last little while, newest at the right, like
 * a scope. Charging, it climbs quickly and then slower and slower towards the
 * battery's voltage; emptying, it falls the same way. The dotted line marks
 * 63 % of the battery: a capacitor charging through a resistor gets there in
 * resistance × capacitance seconds.
 */
export function ChargeGraph({ times, volts, now, span, supply }: ChargeGraphProps) {
  const clip = useId();
  const [plot, { width: W, height: H }] = useSize();
  const highest = Math.max(supply ?? 0, ...volts.map(Math.abs));
  const top = topVolts(highest);
  const lowest = Math.min(0, ...volts);
  const bottom = lowest < -0.01 ? -topVolts(-lowest) : 0;
  const x = (t: number) => LEFT + ((t - (now - span)) / span) * (W - LEFT - RIGHT);
  const y = (v: number) => H - BOTTOM - ((v - bottom) / (top - bottom)) * (H - TOP - BOTTOM);
  const step = top - bottom > 12 ? 5 : top - bottom > 5 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = Math.ceil(bottom / step) * step; v <= top; v += step) ticks.push(v);
  const line = times.map((t, i) => `${i === 0 ? 'M' : 'L'}${n(x(t))},${n(y(volts[i] ?? 0))}`).join(' ');
  const latest = volts.at(-1);
  const seconds = [span, (span * 2) / 3, span / 3, 0];

  return (
    <figure className="iv charge">
      <div className="iv-plot" ref={plot}>
        {W > LEFT + RIGHT && H > TOP + BOTTOM && (
          <svg width={W} height={H} viewBox={`0 0 ${String(W)} ${String(H)}`} role="img" aria-label="The capacitor's voltage over time">
            <defs>
              <clipPath id={clip}>
                <rect x={LEFT} y={TOP - 4} width={W - LEFT - RIGHT + 4} height={H - TOP - BOTTOM + 8} />
              </clipPath>
            </defs>
            {ticks.map((v) => (
              <line key={v} className="iv-grid" x1={LEFT} x2={W - RIGHT} y1={y(v)} y2={y(v)} />
            ))}
            {seconds.map((s) => (
              <line key={s} className="iv-grid" x1={x(now - s)} x2={x(now - s)} y1={TOP} y2={H - BOTTOM} />
            ))}
            <path className="iv-axis" d={`M${String(LEFT)},${String(TOP)} V${String(H - BOTTOM)} H${String(W - RIGHT)}`} />
            {ticks.map((v) => (
              <text key={v} className="iv-tick" x={LEFT - 6} y={y(v) + 3.5} textAnchor="end">
                {v}
              </text>
            ))}
            {seconds.map((s) => (
              <text key={s} className="iv-tick" x={x(now - s)} y={H - BOTTOM + 14} textAnchor="middle">
                {s === 0 ? 'now' : `−${String(Math.round(s))} s`}
              </text>
            ))}
            <text className="iv-label" x={(LEFT + W - RIGHT) / 2} y={H - 4} textAnchor="middle">
              time
            </text>
            <text className="iv-label" x={10} y={TOP + 4} transform={`rotate(-90 10 ${String(TOP + 4)})`} textAnchor="end">
              volts
            </text>

            {supply !== undefined && (
              <>
                <line className="charge-supply" x1={LEFT} x2={W - RIGHT} y1={y(supply)} y2={y(supply)} />
                <text className="iv-tick" x={LEFT + 4} y={y(supply) - 4}>
                  {`battery, ${supply.toFixed(2)} V`}
                </text>
                <line className="charge-tau" x1={LEFT} x2={W - RIGHT} y1={y(supply * (1 - Math.exp(-1)))} y2={y(supply * (1 - Math.exp(-1)))} />
                <text className="iv-tick" x={LEFT + 4} y={y(supply * (1 - Math.exp(-1))) - 4}>
                  63 %
                </text>
              </>
            )}
            <g clipPath={`url(#${clip})`}>{line && <path className="charge-line" d={line} />}</g>
            {latest !== undefined && (
              <g className="iv-dot">
                <text className="iv-reading" x={x(now) - 9} y={Math.max(y(latest) - 9, TOP + 10)} textAnchor="end">
                  {`${latest.toFixed(2)} V`}
                </text>
                <circle cx={x(now)} cy={y(latest)} r="4" />
              </g>
            )}
          </svg>
        )}
      </div>
      <figcaption>
        <span className="key key-charge">its voltage</span>
        {supply !== undefined && <span className="key key-load">battery</span>}
      </figcaption>
    </figure>
  );
}
