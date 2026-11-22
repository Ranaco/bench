import type { IvPoint } from '@bench/engine';
import { useId } from 'react';
import { useSize } from './useSize';

interface IvGraphProps {
  /** The LED measured by the engine, or undefined while its model isn't written. */
  readonly curve: readonly IvPoint[] | undefined;
  /** Points read off the datasheet's graph. */
  readonly datasheet: readonly IvPoint[];
  /** What a battery and resistor in a simple loop allow, when the LED is in one. */
  readonly load?: { readonly volts: number; readonly ohms: number };
  /** Where the LED is right now. */
  readonly operating: IvPoint | undefined;
  readonly maxAmps: number;
}

/** Room for the axes and their labels, in pixels: the plot gets whatever's left of the window. */
const LEFT = 36;
const RIGHT = 12;
const TOP = 10;
const BOTTOM = 34;
const MAX_VOLTS = 3;
const MAX_MA = 80;

const n = (value: number) => (Math.round(value * 10) / 10).toString();

/**
 * The LED's current-vs-voltage curve, the straight line the battery and
 * resistor allow, and the point where they cross: where the LED settles.
 * It fills its window and redraws at the window's size, so a bigger window
 * means a bigger plot with labels that stay the same size.
 */
export function IvGraph(props: IvGraphProps) {
  const { curve, datasheet, load, operating, maxAmps } = props;
  const clip = useId();
  const [plot, { width: W, height: H }] = useSize();
  const x = (volts: number) => LEFT + (volts / MAX_VOLTS) * (W - LEFT - RIGHT);
  const y = (amps: number) => H - BOTTOM - ((amps * 1000) / MAX_MA) * (H - TOP - BOTTOM);

  // Volts the LED doesn't use are left to push current through the rest of the loop.
  const loadLine = load && `M${n(x(0))},${n(y(load.volts / load.ohms))} L${n(x(load.volts))},${n(y(0))}`;
  const line = curve
    ?.filter((p) => Number.isFinite(p.amps))
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${n(x(p.volts))},${n(y(Math.min(p.amps, (MAX_MA * 2) / 1000)))}`)
    .join(' ');
  const offChart = operating !== undefined && operating.amps * 1000 > MAX_MA;
  const dot = operating && {
    cx: x(Math.min(operating.volts, MAX_VOLTS)),
    cy: y(Math.min(operating.amps, MAX_MA / 1000)),
    label: `${operating.volts.toFixed(2)} V · ${(operating.amps * 1000).toFixed(1)} mA`,
  };

  return (
    <figure className="iv">
      <div className="iv-plot" ref={plot}>
        {W > LEFT + RIGHT && H > TOP + BOTTOM && (
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${String(W)} ${String(H)}`}
            role="img"
            aria-label="The LED's current against the voltage across it"
          >
            <defs>
              <clipPath id={clip}>
                <rect x={LEFT} y={TOP} width={W - LEFT - RIGHT} height={H - TOP - BOTTOM} />
              </clipPath>
            </defs>

            {[0.5, 1, 1.5, 2, 2.5, 3].map((v) => (
              <line key={v} className="iv-grid" x1={x(v)} x2={x(v)} y1={TOP} y2={H - BOTTOM} />
            ))}
            {[20, 40, 60, 80].map((ma) => (
              <line key={ma} className="iv-grid" x1={LEFT} x2={W - RIGHT} y1={y(ma / 1000)} y2={y(ma / 1000)} />
            ))}
            <path className="iv-axis" d={`M${String(LEFT)},${String(TOP)} V${String(H - BOTTOM)} H${String(W - RIGHT)}`} />
            {[0, 1, 2, 3].map((v) => (
              <text key={v} className="iv-tick" x={x(v)} y={H - BOTTOM + 14} textAnchor="middle">
                {v}
              </text>
            ))}
            {[0, 20, 40, 60, 80].map((ma) => (
              <text key={ma} className="iv-tick" x={LEFT - 6} y={y(ma / 1000) + 3.5} textAnchor="end">
                {ma}
              </text>
            ))}
            <text className="iv-label" x={(LEFT + W - RIGHT) / 2} y={H - 4} textAnchor="middle">
              volts across the LED
            </text>
            <text className="iv-label" x={10} y={TOP + 4} transform={`rotate(-90 10 ${String(TOP + 4)})`} textAnchor="end">
              mA
            </text>

            <g clipPath={`url(#${clip})`}>
              <line className="iv-max" x1={LEFT} x2={W - RIGHT} y1={y(maxAmps)} y2={y(maxAmps)} />
              {loadLine && <path className="iv-load" d={loadLine} />}
              {line && <path className="iv-curve" d={line} />}
              {datasheet.map((p) => (
                <circle key={p.volts} className="iv-datasheet" cx={x(p.volts)} cy={y(p.amps)} r="2.5" />
              ))}
            </g>
            <text className="iv-max-label" x={W - RIGHT - 2} y={y(maxAmps) - 4} textAnchor="end">
              {`${String(maxAmps * 1000)} mA max`}
            </text>

            {dot && (
              <g className={offChart ? 'iv-dot off' : 'iv-dot'}>
                <text
                  className="iv-reading"
                  x={dot.cx > W - 120 ? dot.cx - 9 : dot.cx + 9}
                  y={Math.max(dot.cy - 9, TOP + 10)}
                  textAnchor={dot.cx > W - 120 ? 'end' : 'start'}
                >
                  {dot.label}
                </text>
                <circle cx={dot.cx} cy={dot.cy} r="5" />
                {offChart && <path d={`M${n(dot.cx - 5)},${n(dot.cy + 12)} L${n(dot.cx)},${n(dot.cy + 6)} L${n(dot.cx + 5)},${n(dot.cy + 12)}`} />}
              </g>
            )}
          </svg>
        )}
      </div>
      <figcaption>
        <span className="key key-curve">your LED</span>
        <span className="key key-datasheet">datasheet</span>
        {loadLine && <span className="key key-load">battery + resistor</span>}
      </figcaption>
    </figure>
  );
}
