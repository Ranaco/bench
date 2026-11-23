import type { ReactNode } from 'react';
import type { CAPACITOR_VALUES } from '../builder/catalog';
import { CapacitorView } from './capacitor/CapacitorView';
import { KnobView, type KnobLive } from './knob/KnobView';

/** Which part the 3D view shows, and what the board says about it. */
export type Subject =
  | {
      readonly kind: 'knob';
      readonly turn: number;
      readonly onTurn: (turn: number) => void;
      readonly label: string | undefined;
      readonly live: KnobLive | undefined;
    }
  | {
      readonly kind: 'capacitor';
      readonly uf: (typeof CAPACITOR_VALUES)[number];
      readonly onUf?: (uf: (typeof CAPACITOR_VALUES)[number]) => void;
      readonly label: string | undefined;
      readonly held: number | undefined;
    };

/**
 * A part in 3D (docs/3d.md). Loaded on its own, the first time the 3D view
 * opens: three.js, react-three-fiber and drei come with it.
 */
export default function Viewer3d({ subject, note, chooser }: { readonly subject: Subject; readonly note?: string; readonly chooser?: ReactNode }) {
  if (subject.kind === 'knob') {
    return <KnobView turn={subject.turn} onTurn={subject.onTurn} label={subject.label} live={subject.live} note={note} chooser={chooser} />;
  }
  return <CapacitorView uf={subject.uf} onUf={subject.onUf} label={subject.label} held={subject.held} note={note} chooser={chooser} />;
}
