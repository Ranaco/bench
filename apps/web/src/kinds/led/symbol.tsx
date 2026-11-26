import { LED_BODY } from '../shapes';
import { Strokes } from '../symbol';

/** A diode's triangle and bar, with its two light arrows. */
export function LedSymbol() {
  return (
    <>
      <Strokes
        paths={[
          { d: 'M0,-60 V-15 M0,15 V60 M-16,15 H16' },
          { d: 'M22,-9 L36,-21 M30,-21 H36 V-15 M24,5 L38,-7 M32,-7 H38 V-1', className: 'arrows' },
        ]}
      />
      <path className="led-body" d={LED_BODY} />
    </>
  );
}

/** The light filling an LED's triangle, drawn over its symbol: 0 dark, 1 at full brightness. */
export function LedLight({ brightness }: { readonly brightness: number }) {
  return <path className="led-light" d={LED_BODY} opacity={brightness} />;
}
