import { KNOB_10K } from '@bench/engine';
import type { PartKind } from './board';
import { KNOB_DIAL as DIAL } from './catalog';

/**
 * Each part's schematic symbol, drawn around its centre with its pins where
 * the catalog puts them. The same drawings as Chapter 1, so a part looks the
 * same everywhere.
 */

const PATHS: Readonly<Record<PartKind, readonly { readonly d: string; readonly className?: string }[]>> = {
  battery: [{ d: 'M0,-60 V-18 M-22,-18 H22 M-10,-8 H10 M-22,8 H22 M-10,18 H10 M0,18 V60' }],
  resistor: [{ d: 'M-60,0 H-40 L-33.3,-9 L-20,9 L-6.7,-9 L6.7,9 L20,-9 L33.3,9 L40,0 H60' }],
  led: [
    { d: 'M0,-60 V-15 M0,15 V60 M-16,15 H16' },
    { d: 'M22,-9 L36,-21 M30,-21 H36 V-15 M24,5 L38,-7 M32,-7 H38 V-1', className: 'arrows' },
  ],
  ground: [{ d: 'M0,-40 V0 M-14,0 H14 M-9,6 H9 M-4,12 H4' }],
  // The leads to its contacts; the lever is drawn by SwitchLever, slid to one side.
  switch: [{ d: 'M-60,0 H-24 M24,-20 H60 M24,20 H60' }],
  // The leads to its two contacts; the cap is drawn by ButtonCap, up or held down.
  button: [{ d: 'M-60,0 H-24 M24,0 H60' }],
  // The track; the wiper and the dial are drawn by KnobWiper and KnobDial, wherever it's turned to.
  knob: [{ d: 'M-60,0 H-40 L-33.3,-9 L-20,9 L-6.7,-9 L6.7,9 L20,-9 L33.3,9 L40,0 H60' }],
  // A straight plate for plus and a curved one for minus: an electrolytic only works one way round.
  capacitor: [{ d: 'M0,-60 V-6 M-22,-6 H22 M-22,12 Q0,2 22,12 M0,7 V60' }],
  junction: [],
};

/** Where each kind's contacts are: little rings the lever or the button's bar touches. */
const CONTACTS: Readonly<Partial<Record<PartKind, readonly (readonly [number, number])[]>>> = {
  switch: [
    [-20, 0],
    [20, -20],
    [20, 20],
  ],
  button: [
    [-20, 0],
    [20, 0],
  ],
};

const CONTACT_RADIUS = 4;

/** The LED's triangle, which fills with light. */
const LED_BODY = 'M-16,-15 H16 L0,15 Z';

export function PartSymbol({ kind }: { readonly kind: PartKind }) {
  return (
    <>
      {PATHS[kind].map((path) => (
        <path key={path.d} className={path.className ? `symbol ${path.className}` : 'symbol'} d={path.d} />
      ))}
      {kind === 'led' && <path className="led-body" d={LED_BODY} />}
      {CONTACTS[kind]?.map(([x, y]) => (
        <circle key={`${String(x)},${String(y)}`} className="contact" cx={x} cy={y} r={CONTACT_RADIUS} />
      ))}
      {kind === 'junction' && <circle className="junction-dot" r="4.5" />}
      {kind === 'battery' && (
        <text className="sign" x="28" y="-22">
          +
        </text>
      )}
      {kind === 'capacitor' && (
        <text className="sign" x="24" y="-14">
          +
        </text>
      )}
    </>
  );
}

/** The light filling an LED's triangle, drawn over its symbol: 0 dark, 1 at full brightness. */
export function LedLight({ brightness }: { readonly brightness: number }) {
  return <path className="led-light" d={LED_BODY} opacity={brightness} />;
}

/** A slide switch's lever, from common's contact to the contact of the side it's slid to. */
export function SwitchLever({ side }: { readonly side: 'a' | 'b' }) {
  const y = side === 'a' ? -20 : 20;
  // From the edge of common's ring to the edge of the other: touching it, not drawn through it.
  const length = Math.hypot(40, y);
  const ux = 40 / length;
  const uy = y / length;
  return (
    <line
      className="symbol lever"
      x1={-20 + ux * CONTACT_RADIUS}
      y1={uy * CONTACT_RADIUS}
      x2={20 - ux * CONTACT_RADIUS}
      y2={y - uy * CONTACT_RADIUS}
    />
  );
}

/** How far a push button's bar sits above its contacts when let go, and how far its cap travels. */
const BUTTON_UP = 12;

/** A push button's bar, stem and cap: up, clear of the contacts, or pressed down onto them. */
export function ButtonCap({ pressed }: { readonly pressed: boolean }) {
  const bar = pressed ? -CONTACT_RADIUS : -CONTACT_RADIUS - BUTTON_UP;
  return <path className="symbol cap" d={`M-28,${String(bar)} H28 M0,${String(bar)} V${String(bar - 16)} M-12,${String(bar - 16)} H12`} />;
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

/** A part's symbol, shrunk to fit a palette tile. */
export function PaletteIcon({ kind }: { readonly kind: PartKind }) {
  return (
    <svg className="palette-icon" viewBox="-70 -70 140 140" aria-hidden="true">
      <PartSymbol kind={kind} />
      {kind === 'switch' && <SwitchLever side="a" />}
      {kind === 'button' && <ButtonCap pressed={false} />}
      {kind === 'knob' && (
        <>
          <KnobWiper turn={0.5} />
          <KnobDial turn={0.5} />
        </>
      )}
    </svg>
  );
}
