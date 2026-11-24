import { CONTACT_RADIUS } from '../shapes';
import { Contacts, Strokes } from '../symbol';

/** The leads to its three contacts; the lever is drawn by SwitchLever, slid to one side. */
export function SwitchSymbol() {
  return (
    <>
      <Strokes paths={[{ d: 'M-60,0 H-24 M24,-20 H60 M24,20 H60' }]} />
      <Contacts
        at={[
          [-20, 0],
          [20, -20],
          [20, 20],
        ]}
      />
    </>
  );
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

/** On a palette tile: slid to side A. */
export function SwitchIcon() {
  return <SwitchLever side="a" />;
}
