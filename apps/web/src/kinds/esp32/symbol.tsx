import { Strokes } from '../symbol';
import { ESP32_BODY, ESP32_PINS } from './board';

/** The board's outline, a short lead out to each pin, and the pins' names written inside. */
export function Esp32Symbol() {
  return (
    <>
      <Strokes
        paths={[
          {
            d: [
              `M${String(-ESP32_BODY.halfX)},${String(-ESP32_BODY.halfY)} H${String(ESP32_BODY.halfX)} V${String(ESP32_BODY.halfY)} H${String(-ESP32_BODY.halfX)} Z`,
              ...ESP32_PINS.map((p) => `M${String(p.x)},${String(p.y)} H${String(Math.sign(p.x) * ESP32_BODY.halfX)}`),
            ].join(' '),
          },
        ]}
      />
      <text className="chip-title" x="0" y="-4" textAnchor="middle">
        ESP32
      </text>
      <text className="chip-subtitle" x="0" y="12" textAnchor="middle">
        DevKitC
      </text>
      {ESP32_PINS.map((p) => (
        <text
          key={p.id}
          className="pin-name"
          x={p.x < 0 ? -ESP32_BODY.halfX + 6 : ESP32_BODY.halfX - 6}
          y={p.y + 3.5}
          textAnchor={p.x < 0 ? 'start' : 'end'}
        >
          {p.name}
        </text>
      ))}
    </>
  );
}
