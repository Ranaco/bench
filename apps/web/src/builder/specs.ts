/** Spec sheets: each kind's is in its own folder (kinds/<kind>/sheet.ts); this looks one up. */
import { VIEWS } from '../kinds/views';
import type { SpecSheet } from '../kinds/sheet';
import type { PartKind, PlacedPart } from './board';

export { shown, SOURCES, type Source, type SpecField, type SpecSection, type SpecSheet } from '../kinds/sheet';

/** A part's spec sheet, or undefined for parts without one (ground, junctions). */
export function sheetFor(kind: PartKind, props: PlacedPart['props']): SpecSheet | undefined {
  return VIEWS[kind].sheet?.(props);
}
