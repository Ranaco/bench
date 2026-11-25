/**
 * What the rest of Bench needs from each part's code: its pins as nodes, what it reports (a temperature, a charge, a
 * pin's mode), and how it's built. Any code for a part works on the board as long as it keeps to these, whether it's
 * Bench's default, the learner's own from a lesson, or a project's own copy.
 */
import type { CellSpec } from '../parts/battery';
import type { ElectrolyticSpec } from '../parts/electrolytic';
import type { ResistorSpec } from '../parts/resistor';
import type { Side } from '../parts/slide-switch';
import type { LedSpec } from './led/default';
import type { SwitchSpec } from './switch/default';
import type { PotSpec } from './potentiometer/default';
import type { Inside, TransistorSpec } from './transistor/default';
import type { MotorSpec } from './motor/default';
import type { ChannelInputs, DriverPins, DriverSpec, Outputs } from './driver/default';
import type { DiodeSpec } from '../parts/diode';
import type { GpioMode, GpioSpec, Level } from './gpio/default';
import type { Node, Part, Readings } from '../types';

export interface BatteryModel extends Part {
  readonly plus: Node;
  readonly minus: Node;
}

export interface ResistorModel extends Part {
  readonly a: Node;
  readonly b: Node;
  readonly spec: ResistorSpec;
  readonly burnt: boolean;
  readonly temperature: number;
}

export interface LedModel extends Part {
  readonly anode: Node;
  readonly cathode: Node;
  readonly spec: LedSpec;
  readonly burnt: boolean;
  readonly temperature: number;
}

export interface SwitchModel extends Part {
  readonly a: Node;
  readonly b: Node;
  readonly spec: SwitchSpec;
  closed: boolean;
}

export interface SlideSwitchModel extends Part {
  readonly common: Node;
  readonly a: Node;
  readonly b: Node;
  readonly spec: SwitchSpec;
  side: Side;
}

export interface PotentiometerModel extends Part {
  readonly a: Node;
  readonly wiper: Node;
  readonly b: Node;
  readonly spec: PotSpec;
  /** Ohms from pin 1 to the wiper, and from the wiper to pin 3. */
  legs(): readonly [number, number];
}

export interface CapacitorModel extends Part {
  readonly a: Node;
  readonly b: Node;
  /** Volts it's holding, a to b, as of the last tick. */
  readonly held: number;
  settle(r: Parameters<NonNullable<Part['settle']>>[0], dt: number): void;
}

export interface ElectrolyticModel extends Part {
  readonly plus: Node;
  readonly minus: Node;
  readonly spec: ElectrolyticSpec;
  readonly held: number;
}

export interface TransistorModel extends Part {
  readonly collector: Node;
  readonly base: Node;
  readonly emitter: Node;
  readonly spec: TransistorSpec;
  /** The nodes just inside its base and collector leads: there once its stamp has run. */
  readonly inside: Inside;
  /** Bench's own: the highest collector-to-emitter volts since last asked, and starts again. */
  takeHighest?(): number;
}

export interface MotorModel extends Part {
  readonly plus: Node;
  readonly minus: Node;
  readonly spec: MotorSpec;
  /** The winding's current at the end of the last step, A. */
  readonly amps: number;
  /** How fast the shaft turns, radians per second. */
  readonly speed: number;
  /** How far the shaft has turned, radians. */
  readonly angle: number;
  /** The volts it makes by turning. */
  readonly backEmf: number;
  /** True while something holds the shaft still. */
  held: boolean;
}

export interface DriverModel extends Part {
  readonly pins: DriverPins;
  readonly spec: DriverSpec;
  /** STBY as last read: HIGH to run. */
  readonly stby: boolean;
  /** Each channel's inputs as last read: A, then B. */
  readonly inputs: readonly [ChannelInputs, ChannelInputs];
  /** Each channel's outputs: A, then B. */
  readonly outputs: readonly [Outputs, Outputs];
  /** True while its logic supply is high enough to run. */
  readonly powered: boolean;
  /** True while an input sits between LOW and HIGH. */
  readonly uncertain: boolean;
  /** The current out of a channel's OUT1, through its load, and back in at OUT2. */
  loadAmps(r: Readings, channel: 0 | 1): number;
}

export interface DiodeModel extends Part {
  readonly anode: Node;
  readonly cathode: Node;
  readonly spec: DiodeSpec;
}

export interface GpioModel extends Part {
  readonly pin: Node;
  readonly spec: GpioSpec;
  mode: GpioMode;
  high: boolean;
  /** What it reads at `volts` against the chip's ground, held there through `ohms`. */
  read(volts: number, ohms: number): Level;
}

export interface Esp32Model extends Part {
  readonly vdd: Node;
  readonly gnd: Node;
  readonly spec: GpioSpec;
  /** Each GPIO by its number: GPIO4 is pins.get(4). */
  readonly pins: ReadonlyMap<number, GpioModel>;
  /** Pins that can only read. */
  readonly inputOnly: ReadonlySet<number>;
}

/** How each code module builds its part. A composite takes the code of the part inside it, last. */
export interface ModuleClasses {
  battery: new (name: string, plus: Node, minus: Node, volts: number, ohms: number) => BatteryModel;
  resistor: new (name: string, a: Node, b: Node, ohms: number, spec?: ResistorSpec) => ResistorModel;
  led: new (name: string, anode: Node, cathode: Node, spec?: LedSpec) => LedModel;
  switch: new (name: string, a: Node, b: Node, closed?: boolean, spec?: SwitchSpec) => SwitchModel;
  'slide-switch': new (
    name: string,
    common: Node,
    a: Node,
    b: Node,
    side?: Side,
    spec?: SwitchSpec,
    contact?: ModuleClasses['switch'],
  ) => SlideSwitchModel;
  potentiometer: new (name: string, a: Node, wiper: Node, b: Node, turn?: number, spec?: PotSpec) => PotentiometerModel;
  capacitor: new (name: string, a: Node, b: Node, farads: number) => CapacitorModel;
  electrolytic: new (
    name: string,
    plus: Node,
    minus: Node,
    spec?: ElectrolyticSpec,
    capacitor?: ModuleClasses['capacitor'],
  ) => ElectrolyticModel;
  transistor: new (name: string, collector: Node, base: Node, emitter: Node, spec?: TransistorSpec) => TransistorModel;
  diode: new (name: string, anode: Node, cathode: Node, spec?: DiodeSpec) => DiodeModel;
  motor: new (name: string, plus: Node, minus: Node, spec?: MotorSpec) => MotorModel;
  driver: new (name: string, pins: DriverPins, spec?: DriverSpec, grounds?: readonly Node[]) => DriverModel;
  gpio: new (name: string, pin: Node, vdd: Node, gnd: Node, spec?: GpioSpec) => GpioModel;
  esp32: new (
    name: string,
    vdd: Node,
    gnd: Node,
    gpios: Readonly<Record<number, Node>>,
    spec?: GpioSpec,
    grounds?: readonly Node[],
    inputOnly?: ReadonlySet<number>,
    gpio?: ModuleClasses['gpio'],
  ) => Esp32Model;
}

/** A code module: one part's code, in one file. */
export type ModuleId = keyof ModuleClasses;

/** A full set of code, one class per module: what a board builds its parts from. */
export type Code = { readonly [K in ModuleId]: ModuleClasses[K] };

/** Every module, in the order a learner meets them (the built-ins first). */
export const MODULES: readonly ModuleId[] = [
  'battery',
  'resistor',
  'led',
  'switch',
  'slide-switch',
  'potentiometer',
  'capacitor',
  'electrolytic',
  'transistor',
  'gpio',
  'esp32',
  'diode',
  'motor',
  'driver',
];

/** Cell specs, for code that builds a battery from one. */
export type { CellSpec };
