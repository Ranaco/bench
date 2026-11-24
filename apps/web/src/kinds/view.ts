/**
 * How a kind of part looks and reads in Bench, beside what it does (kind.ts): its Inspector controls and rows, its
 * warnings, its label on the board and anything you can click on it there, its spec sheet and its Graph.
 */
import type { SwitchSpec } from '@bench/engine';
import type { ComponentType } from 'react';
import type { PlacedPart } from '../builder/board';
import type { SpecSheet } from '../builder/specs';
import { formatSI } from '../format';
import type { BoardSim, PartReading } from '../sim';

/** One Inspector row: what it is, and its value. */
export type Row = readonly [string, string];

/** What a kind's Inspector controls can do to the part. */
export interface ControlProps {
  readonly part: PlacedPart;
  readonly reading: PartReading | undefined;
  readonly onProp: (id: string, key: string, value: string | number) => void;
  /** Slides a slide switch to its other side. */
  readonly onFlip: (id: string) => void;
  /** Push buttons kept held down, and holding or letting one go. */
  readonly holds: ReadonlySet<string>;
  readonly onHold: (id: string, held: boolean) => void;
}

export interface KindView {
  /** The Inspector's controls for its settings. */
  readonly Controls?: ComponentType<ControlProps>;
  /** The Inspector's rows: what it's doing right now. `pin` gives a pin's volts from ground. */
  rows?(part: PlacedPart, reading: PartReading, pin: (id: string) => number): readonly Row[];
  /** One line about the state it's in, above the rows. */
  state?(reading: PartReading): string | undefined;
  /** What the Inspector says when it's over what its datasheet allows. */
  overWarning?(part: PlacedPart, reading: PartReading): string | undefined;
  /** Its spec sheet, for its settings. */
  sheet?(props: PlacedPart['props']): SpecSheet | undefined;
  /** The 3D view can show it. */
  readonly in3d?: boolean;
  /** Its schematic symbol, drawn around its centre. */
  readonly Symbol: ComponentType;
  /** On its palette tile, drawn over the symbol: anything that moves, at rest (a lever, a dial). */
  readonly Icon?: ComponentType;
  /** What's written beside it on the board: its label, then its value. Nothing for wiring. */
  label(part: PlacedPart): readonly string[];
  /** Drawn over its symbol on the board: what you click, drag or hold. */
  readonly Actuator?: ComponentType<{ readonly part: PlacedPart; readonly sim: BoardSim }>;
  /** What the Graph window draws for it. */
  readonly Graph?: ComponentType<{ readonly chosen: PlacedPart }>;
  /** With nothing selected, the Graph draws the part whose kind ranks highest. */
  readonly graphRank?: number;
}

/** Amps, volts and watts as the Inspector writes them. */
export const amps = (value: number | undefined) => (value === undefined ? '—' : formatSI(value, 'A', { floor: 1e-9 }));
export const volts = (value: number) => formatSI(value, 'V', { floor: 1e-6 });
export const watts = (value: number) => formatSI(value, 'W', { floor: 1e-9 });

/** What a switch's contacts are rated for, as its datasheet puts it. */
export const rating = (spec: SwitchSpec) =>
  `${formatSI(spec.ratedAmps, 'A', { trim: true })} at ${formatSI(spec.ratedVolts, 'V', { trim: true })} DC`;

/** The plain label: just its name. */
export const nameOnly = (part: PlacedPart) => [part.label];
