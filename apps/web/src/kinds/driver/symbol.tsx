import { Strokes } from '../symbol';
import { DRIVER_BODY, DRIVER_PINS } from './board';

/** The chip's outline, a short lead out to each pin, and the pins' names written inside. */
export function DriverSymbol() {
  const { halfX, halfY } = DRIVER_BODY;
  return (
    <>
      <Strokes
        paths={[
          {
            d: [
              `M${String(-halfX)},${String(-halfY)} H${String(halfX)} V${String(halfY)} H${String(-halfX)} Z`,
              ...DRIVER_PINS.map((p) => `M${String(p.x)},${String(p.y)} H${String(Math.sign(p.x) * halfX)}`),
            ].join(' '),
          },
        ]}
      />
      <text className="chip-title" x="0" y="-4" textAnchor="middle">
        TB6612FNG
      </text>
      <text className="chip-subtitle" x="0" y="12" textAnchor="middle">
        Motor driver
      </text>
      {DRIVER_PINS.map((p) => (
        <text key={p.id} className="pin-name" x={p.x < 0 ? -halfX + 6 : halfX - 6} y={p.y + 3.5} textAnchor={p.x < 0 ? 'start' : 'end'}>
          {p.name}
        </text>
      ))}
    </>
  );
}
