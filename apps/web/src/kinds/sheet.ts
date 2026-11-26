/**
 * Spec sheets: the datasheet numbers each part is simulated with, and where
 * each one comes from. Read-only: the numbers are the real parts', taken from
 * the engine's own constants, so a sheet can never disagree with the circuit.
 */

/** Where a number comes from, from most to least certain. */
export type Source = 'datasheet' | 'standard' | 'fitted' | 'worked-out' | 'typical' | 'estimate';

export const SOURCES: Readonly<Record<Source, { readonly label: string; readonly meaning: string }>> = {
  datasheet: { label: 'Datasheet', meaning: 'Printed on the part’s datasheet.' },
  standard: { label: 'Standard', meaning: 'Set by a published standard.' },
  fitted: { label: 'Fitted', meaning: 'Fitted to a graph on the datasheet, so the model matches the real part.' },
  'worked-out': { label: 'Worked out', meaning: 'Calculated from published figures.' },
  typical: { label: 'Typical', meaning: 'Usual for this type of part, but not checked against one datasheet.' },
  estimate: { label: 'Estimate', meaning: 'Not on any datasheet: a reasonable estimate.' },
};

export interface SpecField {
  readonly label: string;
  /** The datasheet's symbol for it, like VF. */
  readonly symbol?: string;
  readonly value: number;
  /** The unit it's shown in. */
  readonly unit: string;
  /** Base units (A, Ω, J/K) per shown unit: 0.001 for mA. */
  readonly scale: number;
  readonly source: Source;
  readonly note: string;
}

export interface SpecSection {
  readonly title: string;
  readonly fields: readonly SpecField[];
}

export interface SpecSheet {
  readonly maker: string;
  readonly model: string;
  readonly description: string;
  /** The document the numbers come from. */
  readonly document: string;
  readonly sections: readonly SpecSection[];
}

export const field = (label: string, value: number, unit: string, scale: number, source: Source, note: string, symbol?: string): SpecField => ({
  label,
  value,
  unit,
  scale,
  source,
  note,
  symbol,
});

// Batteries: each supply in the kit is its own sheet, with the same two numbers.

/** Shows a value in its field's unit: 0.03 A as "30" (mA). */
export function shown(f: SpecField): string {
  return new Intl.NumberFormat('en-US', { maximumSignificantDigits: 4 }).format(f.value / f.scale);
}
