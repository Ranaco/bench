/** Pieces every part symbol is drawn from: strokes, contacts, and a + sign. */
import { CONTACT_RADIUS } from './shapes';

/** One or more strokes, in the symbol's line style (`className` adds to it: arrows, an arrowhead). */
export function Strokes({ paths }: { readonly paths: readonly { readonly d: string; readonly className?: string }[] }) {
  return (
    <>
      {paths.map((path) => (
        <path key={path.d} className={path.className ? `symbol ${path.className}` : 'symbol'} d={path.d} />
      ))}
    </>
  );
}

/** A switch's contacts: the rings its lever or bar touches. */
export function Contacts({ at }: { readonly at: readonly (readonly [number, number])[] }) {
  return (
    <>
      {at.map(([x, y]) => (
        <circle key={`${String(x)},${String(y)}`} className="contact" cx={x} cy={y} r={CONTACT_RADIUS} />
      ))}
    </>
  );
}

/** The + beside a part that only works one way round. */
export function Plus({ x, y }: { readonly x: number; readonly y: number }) {
  return (
    <text className="sign" x={x} y={y}>
      +
    </text>
  );
}
