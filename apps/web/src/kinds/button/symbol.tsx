import { CONTACT_RADIUS } from '../shapes';
import { Contacts, Strokes } from '../symbol';

/** How far a push button's bar sits above its contacts when let go, and how far its cap travels. */
const BUTTON_UP = 12;

/** The leads to its two contacts; the cap is drawn by ButtonCap, up or held down. */
export function ButtonSymbol() {
  return (
    <>
      <Strokes paths={[{ d: 'M-60,0 H-24 M24,0 H60' }]} />
      <Contacts
        at={[
          [-20, 0],
          [20, 0],
        ]}
      />
    </>
  );
}

/** A push button's bar, stem and cap: up, clear of the contacts, or pressed down onto them. */
export function ButtonCap({ pressed }: { readonly pressed: boolean }) {
  const bar = pressed ? -CONTACT_RADIUS : -CONTACT_RADIUS - BUTTON_UP;
  return <path className="symbol cap" d={`M-28,${String(bar)} H28 M0,${String(bar)} V${String(bar - 16)} M-12,${String(bar - 16)} H12`} />;
}

/** On a palette tile: up. */
export function ButtonIcon() {
  return <ButtonCap pressed={false} />;
}
