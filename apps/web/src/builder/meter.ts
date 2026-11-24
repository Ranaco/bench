import type { Board, PinRef, Split } from './board';
import { CATALOG } from './catalog';
import type { BoardSnapshot } from '../sim';

/**
 * The multimeter. In Volts it's a voltmeter: red and black leads on any two
 * points, reading red minus black. In Amps it's a clamp meter: the jaws close
 * round a wire and read the current along it without breaking the circuit.
 * While a program switches pins, it reads what the Inspector does: averages,
 * four times a second, as a real meter's display does (see sim/readout.ts).
 */

export type MeterMode = 'volts' | 'amps';
export type Tool = 'red' | 'black' | 'clamp';

/** Where a lead touches: a pin, or a point a fraction `t` of the way along a wire. */
export type ProbeTarget =
  | { readonly kind: 'pin'; readonly pin: PinRef }
  | { readonly kind: 'wire'; readonly wire: string; readonly t: number };

export interface MeterState {
  readonly mode: MeterMode;
  /** Leads that are on the board; any not listed are in their sockets. */
  readonly leads: Readonly<Partial<Record<Tool, ProbeTarget>>>;
}

export const METER_START: MeterState = { mode: 'volts', leads: {} };

export interface Measurement {
  /** Identifies what's measured, so a guess belongs to one measurement. */
  readonly key: string;
  readonly value: number;
  readonly unit: 'V' | 'A';
  /** What the leads are on, in words. */
  readonly what: string;
}

/** The target if it's still on the board, or undefined once its pin or wire has gone. */
export function liveTarget(board: Board, target: ProbeTarget | undefined): ProbeTarget | undefined {
  if (!target) return undefined;
  if (target.kind === 'wire') return board.wires.some((w) => w.id === target.wire) ? target : undefined;
  const part = board.parts.find((p) => p.id === target.pin.part);
  return part && CATALOG[part.kind].pins.some((pin) => pin.id === target.pin.pin) ? target : undefined;
}

/** A lead on a wire that's just been cut moves onto the half it was on, at the same spot. */
export function afterSplits(target: ProbeTarget, splits: readonly Split[]): ProbeTarget {
  let current = target;
  for (const split of splits) {
    if (current.kind !== 'wire' || current.wire !== split.wire) continue;
    current =
      current.t <= split.t
        ? { kind: 'wire', wire: split.halves[0], t: current.t / split.t }
        : { kind: 'wire', wire: split.halves[1], t: (current.t - split.t) / (1 - split.t) };
  }
  return current;
}

const pinKey = (pin: PinRef) => `${pin.part}.${pin.pin}`;

/** A pin's volts as the meter shows them: averaged while a program switches pins, as they are otherwise. */
const pinVolts = (snapshot: BoardSnapshot, pin: PinRef) => snapshot.readout?.pins[pinKey(pin)] ?? snapshot.pins[pinKey(pin)];

/**
 * Volts at a target, from ground (or from wherever the circuit floats, without
 * one: only differences mean anything then, and a voltmeter only reads differences).
 * Along a wire it's between its two ends in proportion: a uniform wire drops
 * its voltage evenly along its length.
 */
export function voltsAt(board: Board, snapshot: BoardSnapshot, target: ProbeTarget): number | undefined {
  if (target.kind === 'pin') return pinVolts(snapshot, target.pin);
  const wire = board.wires.find((w) => w.id === target.wire);
  const a = wire && pinVolts(snapshot, wire.a);
  const b = wire && pinVolts(snapshot, wire.b);
  return a === undefined || b === undefined ? undefined : a + (b - a) * target.t;
}

/** What a lead is on, in words: "D1 anode (+)", "wire W2". */
export function describeTarget(board: Board, target: ProbeTarget): string {
  if (target.kind === 'wire') return `wire ${board.wires.find((w) => w.id === target.wire)?.label ?? ''}`;
  const part = board.parts.find((p) => p.id === target.pin.part);
  if (!part) return 'nothing';
  if (part.kind === 'junction') return `junction ${part.label}`;
  const name = CATALOG[part.kind].pins.find((p) => p.id === target.pin.pin)?.name ?? target.pin.pin;
  return `${part.label} ${name}`;
}

/** Same spot for a guess: a pin, or a wire (anywhere along it). */
const targetKey = (target: ProbeTarget) => (target.kind === 'pin' ? pinKey(target.pin) : `wire:${target.wire}`);

/** What the meter reads, or what to do next when it can't read anything yet. */
export function measure(meter: MeterState, board: Board, snapshot: BoardSnapshot): Measurement | string {
  if (meter.mode === 'volts') {
    const red = liveTarget(board, meter.leads.red);
    const black = liveTarget(board, meter.leads.black);
    if (red && black) {
      const high = voltsAt(board, snapshot, red);
      const low = voltsAt(board, snapshot, black);
      if (high === undefined || low === undefined) return 'Reading…';
      return {
        key: `V:${targetKey(red)}:${targetKey(black)}`,
        value: high - low,
        unit: 'V',
        what: `Red on ${describeTarget(board, red)}, black on ${describeTarget(board, black)}.`,
      };
    }
    if (red) return 'Now put the black lead on another pin or wire.';
    if (black) return 'Now put the red lead on a pin or wire.';
    return 'Drag the red and black leads from the bottom-left of the board onto two pins or wires.';
  }
  const clamp = liveTarget(board, meter.leads.clamp);
  if (clamp?.kind !== 'wire') return 'Drag the clamp from the bottom-left of the board onto a wire.';
  const amps = snapshot.readout?.wires[clamp.wire] ?? snapshot.wires[clamp.wire]?.amps;
  if (amps === undefined) return 'Reading…';
  return { key: `A:${clamp.wire}`, value: Math.abs(amps), unit: 'A', what: `Current along ${describeTarget(board, clamp)}.` };
}
