import { VIEWS } from '../kinds/views';
import type { PartKind } from './board';

/**
 * Each part's schematic symbol, drawn around its centre with its pins where its kind puts them. Each kind draws its
 * own (kinds/<kind>/symbol.tsx), so a part looks the same everywhere.
 */
export function PartSymbol({ kind }: { readonly kind: PartKind }) {
  const { Symbol } = VIEWS[kind];
  return <Symbol />;
}

/** A part's symbol, shrunk to fit a palette tile, with anything that moves on it at rest. */
export function PaletteIcon({ kind }: { readonly kind: PartKind }) {
  const { Icon } = VIEWS[kind];
  return (
    <svg className="palette-icon" viewBox={kind === 'esp32' ? '-110 -95 220 190' : '-70 -70 140 140'} aria-hidden="true">
      <PartSymbol kind={kind} />
      {Icon && <Icon />}
    </svg>
  );
}
