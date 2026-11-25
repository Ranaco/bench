/**
 * A kind of part on the board (a battery, an LED, an ESP32…), everything about it in one place: its pins and size,
 * the code it runs, and what it reads. Each kind lives in its own folder; the board, the simulation and the Inspector
 * loop over them instead of knowing about any one.
 */
import type { Circuit, Code, ModuleId, Node, Part } from '@bench/engine';
import type { PartKind, PlacedPart } from '../builder/board';
import type { ChipReadout, ChipPin, PartReading, Trace } from '../sim/readings';

/** A part's settings, as saved with the board. */
export type Props = Readonly<Record<string, string | number>>;

export interface PinDef {
  readonly id: string;
  /** Unrotated position relative to the part's centre. */
  readonly x: number;
  readonly y: number;
  /** What a meter or tooltip calls it. */
  readonly name: string;
}

/** Unrotated box around a part's centre: what you grab, and what labels keep clear of. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The program running on an ESP32, as far as reading its pins goes. */
export interface ChipProgram {
  /** The pins it has read with analogRead(). */
  readonly analogPins: ReadonlySet<number>;
  /** Its pins as a multimeter would show them, refreshed a few times a second; undefined until the first. */
  readout(pins: Readonly<Record<string, ChipPin>>, supplyAmps: number): ChipReadout | undefined;
}

/** A part on the board, as its kind's code sees it. */
export interface PartContext<P extends Part, M> {
  readonly c: Circuit;
  readonly part: P;
  readonly doc: PlacedPart;
  readonly nodes: Readonly<Record<string, Node>>;
  /** Its own record of what's happened to it over time (see KindModel.memo). */
  readonly memo: M;
  /** False while its code's stamp() isn't written, so it isn't in the circuit. */
  readonly written: boolean;
  /** The last step went wrong: nothing read from the circuit now means anything. */
  readonly failed: boolean;
}

/** The same, while the board is being read: with what's been measured already. */
export interface ReadContext<P extends Part, M> extends PartContext<P, M> {
  readonly amps: number | undefined;
  readonly watts: number;
  /** Volts from its first pin to its second. */
  readonly volts: number;
  /** Its current as an eye would see the light it makes: flicker too fast to see, smoothed to its average. */
  readonly seen: number | undefined;
  /** For an ESP32: the program running on it. */
  readonly program: ChipProgram | undefined;
}

/** What a kind adds to a part's reading. Anything left out keeps the plain value (nothing burnt, nothing over). */
export type KindReading = Partial<Omit<PartReading, 'amps' | 'watts' | 'written'>>;

export interface KindModel<P extends Part = Part, M = unknown> {
  readonly kind: PartKind;
  readonly name: string;
  /** What its tile in the Parts window says, when the name is too long for a tile. */
  readonly tile?: string;
  readonly blurb: string;
  readonly pins: readonly PinDef[];
  readonly box: Box;
  readonly defaults: Props;
  /** The code modules its parts run: its own first, then any of the parts inside it. Empty for wiring. */
  readonly modules: readonly ModuleId[];
  /** Builds one, from `code`. */
  create(label: string, nodes: Readonly<Record<string, Node>>, props: Props, code: Code): P;
  /** A fresh record for one part of this kind, kept for as long as it's on the board. */
  memo?(): M;
  /** After every step: keep the record. */
  track?(ctx: PartContext<P, M>): void;
  /** What it reads, beyond the plain current, voltage and power. */
  read?(ctx: ReadContext<P, M>): KindReading;
  /** A push button: hold it down or let it go. True if that changed anything. */
  press?(part: P, down: boolean): boolean;
  /** A record over time the Graph can draw, from a part's memo: a capacitor's voltage, or one ESP32 pin's (`key`). */
  trace?(memo: M, key: string | undefined): Trace | undefined;
  /** A power source: whether it's supplying current right now. */
  supplies?(ctx: ReadContext<P, M>): boolean;
  /** The ground symbol: voltages are measured from it while it's wired in. */
  readonly grounds?: boolean;
}

/** Declares a kind. Its part and record types are its own business: the registry holds every kind alike. */
export const defineKind = <P extends Part, M = undefined>(kind: KindModel<P, M>): KindModel => kind;

/** A part's settings read as a number, or `fallback` when it's missing or isn't one. */
export function numberProp(props: Props, key: string, fallback: number): number {
  const value = Number(props[key]);
  return Number.isFinite(value) ? value : fallback;
}

/** What every kind's reading starts from. */
export const PLAIN: Omit<PartReading, 'amps' | 'volts' | 'watts' | 'written'> = {
  celsius: undefined,
  burnt: false,
  over: false,
  closed: undefined,
  knob: undefined,
  capacitor: undefined,
  transistor: undefined,
  motor: undefined,
  driver: undefined,
  chip: undefined,
  flips: undefined,
  glowing: undefined,
  peakAmps: undefined,
  glowAmps: undefined,
};

/** The kinds a board can hold, for anything that needs the list. */
export type { PartKind };
