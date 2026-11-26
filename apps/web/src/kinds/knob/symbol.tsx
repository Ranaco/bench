import { KNOB_10K } from '@bench/engine';
import { ZIGZAG } from '../shapes';
import { Strokes } from '../symbol';
import { KNOB_DIAL as DIAL } from './model';

/** The track; the wiper and the dial are drawn by KnobWiper and KnobDial, wherever it's turned to. */
export function KnobSymbol() {
  return <Strokes paths={[{ d: ZIGZAG }]} />;
}

/** Where a knob's wiper touches its track, from -40 (pin 1's end) to 40 (pin 3's), through the same dead zones as the model. */
function wiperX(turn: number): number {
  const { deadZone } = KNOB_10K;
  const along = Math.min(1, Math.max(0, (turn - deadZone) / (1 - 2 * deadZone)));
  return -40 + along * 80;
}

/** A knob's wiper: from its pin, up to an arrow touching the track wherever it's turned to. */
export function KnobWiper({ turn }: { readonly turn: number }) {
  const x = wiperX(turn);
  return <path className="symbol wiper" d={`M0,40 V26 H${String(x)} V13 M${String(x - 5)},20 L${String(x)},12 L${String(x + 5)},20`} />;
}

/** A knob's dial, its pointer swinging through the mechanical angle as it's turned. */
export function KnobDial({ turn }: { readonly turn: number }) {
  const half = KNOB_10K.turnDegrees / 2;
  const angle = ((-half + turn * KNOB_10K.turnDegrees) * Math.PI) / 180;
  const tip = { x: DIAL.x + Math.sin(angle) * (DIAL.r - 3), y: DIAL.y - Math.cos(angle) * (DIAL.r - 3) };
  return (
    <>
      <circle className="symbol dial" cx={DIAL.x} cy={DIAL.y} r={DIAL.r} />
      <line className="symbol dial-pointer" x1={DIAL.x} y1={DIAL.y} x2={tip.x} y2={tip.y} />
    </>
  );
}

/** On a palette tile: turned half way. */
export function KnobIcon() {
  return (
    <>
      <KnobWiper turn={0.5} />
      <KnobDial turn={0.5} />
    </>
  );
}
