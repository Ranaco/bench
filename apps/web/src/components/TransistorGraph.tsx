import { useId } from 'react';
import type { TransistorPoint } from '../measureTransistor';
import { useSize } from './useSize';

/** Where the transistor is now, and where it's been since the graph opened. */
export interface TransistorDot {
  readonly baseVolts: number;
  readonly baseAmps: number;
  readonly collectorAmps: number;
}

interface TransistorGraphProps {
  /** Your transistor, measured with its collector at 10 V; undefined while its model isn't in the circuit. */
  readonly curve: readonly TransistorPoint[] | undefined;
  /** Where it is right now; undefined while there's no collector reading (current() not written). */
  readonly now: TransistorDot | undefined;
  /** Where it's been, oldest first. */
  readonly trail: readonly TransistorDot[];
}

/** Room for the axes and their labels, in pixels. */
const LEFT = 40;
const RIGHT = 12;
const TOP = 10;
const BOTTOM = 34;

const n = (value: number) => (Math.round(value * 10) / 10).toString();

/** The first of these that's at least `value`: axes that grow in round steps. */
const roundUp = (value: number, steps: readonly number[]) => steps.find((s) => s >= value) ?? steps[steps.length - 1];

interface Axis {
  readonly min: number;
  readonly max: number;
  readonly ticks: readonly number[];
  readonly label: string;
}

/** One plot: axes, a curve, a faint trail and the dot now. Every value is in the axis's own unit (V, µA, mA). */
function Plot(props: {
  readonly x: Axis;
  readonly y: Axis;
  readonly curve: readonly (readonly [number, number])[];
  readonly trail: readonly (readonly [number, number])[];
  readonly now: { readonly at: readonly [number, number]; readonly label: string } | undefined;
  readonly aria: string;
}) {
  const { x: X, y: Y } = props;
  const clip = useId();
  const [plot, { width: W, height: H }] = useSize();
  const x = (v: number) => LEFT + ((v - X.min) / (X.max - X.min)) * (W - LEFT - RIGHT);
  const y = (v: number) => H - BOTTOM - ((v - Y.min) / (Y.max - Y.min)) * (H - TOP - BOTTOM);
  // Points far off the top would make huge coordinates: cut them at twice the axis.
  const line = props.curve
    .filter(([, v]) => Number.isFinite(v))
    .map(([u, v], i) => `${i === 0 ? 'M' : 'L'}${n(x(u))},${n(y(Math.min(v, 2 * Y.max)))}`)
    .join(' ');
  const inside = (u: number, v: number) => [Math.min(Math.max(u, X.min), X.max), Math.min(Math.max(v, Y.min), Y.max)] as const;
  const dot = props.now && { at: inside(...props.now.at), label: props.now.label };

  return (
    <div className="iv-plot" ref={plot}>
      {W > LEFT + RIGHT && H > TOP + BOTTOM && (
        <svg width={W} height={H} viewBox={`0 0 ${String(W)} ${String(H)}`} role="img" aria-label={props.aria}>
          <defs>
            <clipPath id={clip}>
              <rect x={LEFT} y={TOP} width={W - LEFT - RIGHT} height={H - TOP - BOTTOM} />
            </clipPath>
          </defs>
          {X.ticks.map((v) => (
            <line key={v} className="iv-grid" x1={x(v)} x2={x(v)} y1={TOP} y2={H - BOTTOM} />
          ))}
          {Y.ticks.map((v) => (
            <line key={v} className="iv-grid" x1={LEFT} x2={W - RIGHT} y1={y(v)} y2={y(v)} />
          ))}
          <path className="iv-axis" d={`M${String(LEFT)},${String(TOP)} V${String(H - BOTTOM)} H${String(W - RIGHT)}`} />
          {X.ticks.map((v) => (
            <text key={v} className="iv-tick" x={x(v)} y={H - BOTTOM + 14} textAnchor="middle">
              {String(Math.round(v * 1000) / 1000)}
            </text>
          ))}
          {Y.ticks.map((v) => (
            <text key={v} className="iv-tick" x={LEFT - 6} y={y(v) + 3.5} textAnchor="end">
              {String(Math.round(v * 10) / 10)}
            </text>
          ))}
          <text className="iv-label" x={(LEFT + W - RIGHT) / 2} y={H - 4} textAnchor="middle">
            {X.label}
          </text>
          <text className="iv-label" x={10} y={TOP + 4} transform={`rotate(-90 10 ${String(TOP + 4)})`} textAnchor="end">
            {Y.label}
          </text>
          <g clipPath={`url(#${clip})`}>
            {line && <path className="iv-curve" d={line} />}
            {props.trail.map(([u, v], i) => {
              const [cu, cv] = inside(u, v);
              return <circle key={i} className="q-trail" cx={x(cu)} cy={y(cv)} r="2" />;
            })}
          </g>
          {dot && (
            <g className="iv-dot">
              <text
                className="iv-reading"
                x={x(dot.at[0]) > W - 140 ? x(dot.at[0]) - 9 : x(dot.at[0]) + 9}
                y={Math.max(y(dot.at[1]) - 9, TOP + 10)}
                textAnchor={x(dot.at[0]) > W - 140 ? 'end' : 'start'}
              >
                {dot.label}
              </text>
              <circle cx={x(dot.at[0])} cy={y(dot.at[1])} r="5" />
            </g>
          )}
        </svg>
      )}
    </div>
  );
}

/** Five steps to the top: every round value the axes grow to divides by 5. */
const ticksTo = (max: number, count = 5) => Array.from({ length: count + 1 }, (_, i) => (max * i) / count);

/** The gain plot's axes grow to keep the dot and its trail on them, in round steps. */
const MICROAMP_STEPS = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
const MILLIAMP_STEPS = [10, 25, 50, 100, 250, 500, 1000];

/**
 * A transistor's two graphs. Its curve: collector current against the voltage on its base, the diode-like climb that
 * job 2's `transfer` describes. Its gain: collector current against base current, a straight line 256 times steeper
 * while it amplifies, which the dot leaves once the rest of the circuit, not the base, is setting the current.
 */
export function TransistorGraph({ curve, now, trail }: TransistorGraphProps) {
  const seen = now ? [...trail, now] : trail;
  const xMax = roundUp(1.15 * Math.max(40, ...seen.map((p) => p.baseAmps * 1e6)), MICROAMP_STEPS);
  const yMax = roundUp(1.15 * Math.max(20, ...seen.map((p) => p.collectorAmps * 1e3)), MILLIAMP_STEPS);
  const label = now && `${(now.baseAmps * 1e6).toFixed(1)} µA in · ${(now.collectorAmps * 1e3).toFixed(2)} mA through`;

  return (
    <figure className="iv q-graph">
      <figcaption className="q-title">Its curve: what the base’s voltage lets through</figcaption>
      <Plot
        x={{ min: 0.55, max: 0.8, ticks: [0.55, 0.6, 0.65, 0.7, 0.75, 0.8], label: 'volts, base to emitter' }}
        y={{ min: 0, max: 60, ticks: [0, 20, 40, 60], label: 'mA' }}
        curve={(curve ?? []).map((p) => [p.baseVolts, p.collectorAmps * 1e3] as const)}
        trail={trail.map((p) => [p.baseVolts, p.collectorAmps * 1e3] as const)}
        now={now && { at: [now.baseVolts, now.collectorAmps * 1e3], label: `${now.baseVolts.toFixed(3)} V · ${(now.collectorAmps * 1e3).toFixed(2)} mA` }}
        aria="The transistor's collector current against the voltage from its base to its emitter"
      />
      <figcaption className="q-title">Its gain: what the base’s current lets through</figcaption>
      <Plot
        x={{ min: 0, max: xMax, ticks: ticksTo(xMax), label: 'µA into the base' }}
        y={{ min: 0, max: yMax, ticks: ticksTo(yMax), label: 'mA' }}
        curve={(curve ?? []).map((p) => [p.baseAmps * 1e6, p.collectorAmps * 1e3] as const)}
        trail={trail.map((p) => [p.baseAmps * 1e6, p.collectorAmps * 1e3] as const)}
        now={now && label ? { at: [now.baseAmps * 1e6, now.collectorAmps * 1e3], label } : undefined}
        aria="The transistor's collector current against the current into its base"
      />
      <figcaption>
        <span className="key key-curve">your transistor, collector at 10 V</span>
        <span className="key key-trail">where it’s been</span>
      </figcaption>
    </figure>
  );
}
