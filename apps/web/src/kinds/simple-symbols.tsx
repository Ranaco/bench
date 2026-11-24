/** The symbols with nothing that moves: a battery, a resistor, a capacitor, a transistor, ground and a junction. */
import { ZIGZAG } from './shapes';
import { Plus, Strokes } from './symbol';

export function BatterySymbol() {
  return (
    <>
      <Strokes paths={[{ d: 'M0,-60 V-18 M-22,-18 H22 M-10,-8 H10 M-22,8 H22 M-10,18 H10 M0,18 V60' }]} />
      <Plus x={28} y={-22} />
    </>
  );
}

export function ResistorSymbol() {
  return <Strokes paths={[{ d: ZIGZAG }]} />;
}

/** A straight plate for plus and a curved one for minus: an electrolytic only works one way round. */
export function CapacitorSymbol() {
  return (
    <>
      <Strokes paths={[{ d: 'M0,-60 V-6 M-22,-6 H22 M-22,12 Q0,2 22,12 M0,7 V60' }]} />
      <Plus x={24} y={-14} />
    </>
  );
}

/**
 * NPN: the base's bar, the collector and emitter leaving it at a slant, and the case's circle. The arrow on the
 * emitter points out, the way current leaves.
 */
export function TransistorSymbol() {
  return (
    <Strokes
      paths={[
        { d: 'M-60,0 H-12 M-12,-20 V20 M-12,-8 L20,-28 V-60 M-12,8 L20,28 V60 M34,0 A30,30 0 1 1 -26,0 A30,30 0 1 1 34,0' },
        { d: 'M12,23 L3.1,22.2 L7.3,15.4 Z', className: 'arrowhead' },
      ]}
    />
  );
}

export function GroundSymbol() {
  return <Strokes paths={[{ d: 'M0,-40 V0 M-14,0 H14 M-9,6 H9 M-4,12 H4' }]} />;
}

export function JunctionSymbol() {
  return <circle className="junction-dot" r="4.5" />;
}
