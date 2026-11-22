import {
  Battery,
  Electrolytic,
  Ground,
  Junction,
  Led,
  Potentiometer,
  Resistor,
  SlideSwitch,
  Switch,
  TACT_SWITCH,
  UVR_25V,
  type ElectrolyticSpec,
  type Node,
  type Part,
} from '@bench/engine';
import { RESISTOR_STOPS, SUPPLIES } from '../kit';
import type { Point } from '../geometry';
import type { PartKind, PlacedPart, Rotation } from './board';

/** Board spacing: every pin sits on this grid, so wires always meet pins exactly. */
export const GRID = 20;

export interface PinDef {
  readonly id: string;
  /** Unrotated position relative to the part's centre. */
  readonly x: number;
  readonly y: number;
  /** What a meter or tooltip calls it. */
  readonly name: string;
}

export interface KindDef {
  readonly kind: PartKind;
  readonly name: string;
  /** What its tile in the Parts window says, when the name is too long for a tile. */
  readonly tile?: string;
  readonly blurb: string;
  readonly pins: readonly PinDef[];
  /** Unrotated box around the centre: what you grab, and what labels keep clear of. */
  readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly defaults: Readonly<Record<string, string | number>>;
  create(label: string, nodes: Readonly<Record<string, Node>>, props: Readonly<Record<string, string | number>>): Part;
}

/** The resistor values on offer: the kit's E6 values (a plain connection is a wire, not a 0 Ω resistor). */
export const RESISTOR_VALUES = RESISTOR_STOPS.filter((ohms) => ohms > 0);

export function supplyFor(id: string | number | undefined) {
  return SUPPLIES.find((s) => s.id === id) ?? SUPPLIES[SUPPLIES.length - 1];
}

/** The capacitors on offer, µF: the Nichicon UVR 25 V ones, from small to large. */
export const CAPACITOR_VALUES = [220, 330, 470, 1000, 2200] as const;

/** A capacitor's datasheet row, from its saved value (1000 µF when the value isn't one on offer). */
export function capacitorSpec(props: Readonly<Record<string, string | number>>): ElectrolyticSpec {
  const value = CAPACITOR_VALUES.find((uf) => uf === Number(props.uf)) ?? 1000;
  return UVR_25V[value];
}

/** Where a knob's dial sits, over its track: what you drag to turn it. */
export const KNOB_DIAL = { x: 0, y: -32, r: 12 };

/** How far a knob is turned, from its saved setting: 0 all the way towards pin 1, 1 all the way towards pin 3. */
export function turnOf(props: Readonly<Record<string, string | number>>): number {
  const turn = Number(props.turn);
  return Number.isFinite(turn) ? Math.min(1, Math.max(0, turn)) : 0.5;
}

export const CATALOG: Readonly<Record<PartKind, KindDef>> = {
  battery: {
    kind: 'battery',
    name: 'Battery',
    blurb: 'Pushes current out of its plus terminal',
    pins: [
      { id: 'plus', x: 0, y: -60, name: 'plus' },
      { id: 'minus', x: 0, y: 60, name: 'minus' },
    ],
    box: { x: -28, y: -60, width: 66, height: 120 }, // to the right of the + sign
    defaults: { supply: '9v' },
    create: (label, nodes, props) => {
      const supply = supplyFor(props.supply);
      return new Battery(label, nodes.plus, nodes.minus, supply.volts, supply.ohms);
    },
  },
  resistor: {
    kind: 'resistor',
    name: 'Resistor',
    blurb: 'Limits how much current flows',
    pins: [
      { id: 'a', x: -60, y: 0, name: 'left' },
      { id: 'b', x: 60, y: 0, name: 'right' },
    ],
    box: { x: -60, y: -18, width: 120, height: 36 },
    defaults: { ohms: 330 },
    create: (label, nodes, props) => new Resistor(label, nodes.a, nodes.b, Number(props.ohms)),
  },
  led: {
    kind: 'led',
    name: 'LED',
    blurb: 'Lights up when current flows anode → cathode',
    pins: [
      { id: 'anode', x: 0, y: -60, name: 'anode (+)' },
      { id: 'cathode', x: 0, y: 60, name: 'cathode (−)' },
    ],
    box: { x: -24, y: -60, width: 66, height: 120 }, // out to the tips of its light arrows
    defaults: {},
    create: (label, nodes) => new Led(label, nodes.anode, nodes.cathode),
  },
  switch: {
    kind: 'switch',
    name: 'Slide switch',
    tile: 'Switch',
    blurb: 'Connects its middle pin, common, to side A or side B',
    pins: [
      { id: 'common', x: -60, y: 0, name: 'common' },
      { id: 'a', x: 60, y: -20, name: 'side A' },
      { id: 'b', x: 60, y: 20, name: 'side B' },
    ],
    box: { x: -60, y: -30, width: 120, height: 60 },
    // Which side common is slid to: 'a' or 'b'.
    defaults: { side: 'a' },
    create: (label, nodes, props) => new SlideSwitch(label, nodes.common, nodes.a, nodes.b, props.side === 'b' ? 'b' : 'a'),
  },
  button: {
    kind: 'button',
    name: 'Push button',
    tile: 'Button',
    blurb: 'Connects its two pins only while it’s held down',
    pins: [
      { id: 'a', x: -60, y: 0, name: 'left' },
      { id: 'b', x: 60, y: 0, name: 'right' },
    ],
    box: { x: -60, y: -36, width: 120, height: 46 }, // up to the top of its cap
    defaults: {},
    create: (label, nodes) => new Switch(label, nodes.a, nodes.b, false, TACT_SWITCH),
  },
  knob: {
    kind: 'knob',
    name: 'Knob',
    blurb: 'A potentiometer: turning it slides its wiper along a 10 kΩ track',
    pins: [
      { id: 'a', x: -60, y: 0, name: 'pin 1' },
      { id: 'wiper', x: 0, y: 40, name: 'wiper (pin 2)' },
      { id: 'b', x: 60, y: 0, name: 'pin 3' },
    ],
    box: { x: -60, y: -52, width: 120, height: 92 }, // from the top of its dial down to the wiper's pin
    defaults: { turn: 0.5 },
    create: (label, nodes, props) => new Potentiometer(label, nodes.a, nodes.wiper, nodes.b, turnOf(props)),
  },
  capacitor: {
    kind: 'capacitor',
    name: 'Capacitor',
    blurb: 'Stores charge: it fills up, holds it, and gives it back',
    pins: [
      { id: 'plus', x: 0, y: -60, name: 'plus (+)' },
      { id: 'minus', x: 0, y: 60, name: 'minus (−)' },
    ],
    box: { x: -24, y: -60, width: 60, height: 120 }, // to the right of its + sign
    defaults: { uf: 1000 },
    create: (label, nodes, props) => new Electrolytic(label, nodes.plus, nodes.minus, capacitorSpec(props)),
  },
  ground: {
    kind: 'ground',
    name: 'Ground',
    blurb: 'The 0 V point voltages are measured from',
    pins: [{ id: 'pin', x: 0, y: -40, name: 'ground' }],
    box: { x: -20, y: -40, width: 40, height: 56 },
    defaults: {},
    create: (label, nodes) => new Ground(label, nodes.pin),
  },
  junction: {
    kind: 'junction',
    name: 'Junction',
    blurb: 'Where wires join: one point, one voltage',
    pins: [{ id: 'pin', x: 0, y: 0, name: 'junction' }],
    box: { x: -8, y: -8, width: 16, height: 16 },
    // Which way the wire it cut runs through it: 'h' (across) or 'v' (up and down), before any turning.
    defaults: { axis: 'h' },
    create: (label, nodes) => new Junction(label, nodes.pin),
  },
};

export const PALETTE: readonly PartKind[] = ['battery', 'resistor', 'led', 'switch', 'button', 'knob', 'capacitor', 'ground'];

/** Rotates a point about the origin by a multiple of 90°. */
export function rotate(p: Point, rotation: Rotation): Point {
  switch (rotation) {
    case 0:
      return p;
    case 90:
      return { x: -p.y, y: p.x };
    case 180:
      return { x: -p.x, y: -p.y };
    case 270:
      return { x: p.y, y: -p.x };
  }
}

/** Where a pin of a placed part sits on the board. */
export function pinAt(part: PlacedPart, pinId: string): Point {
  const pin = CATALOG[part.kind].pins.find((p) => p.id === pinId);
  if (!pin) return { x: part.x, y: part.y };
  const r = rotate(pin, part.rotation);
  return { x: part.x + r.x, y: part.y + r.y };
}

export const snap = (value: number) => Math.round(value / GRID) * GRID;
