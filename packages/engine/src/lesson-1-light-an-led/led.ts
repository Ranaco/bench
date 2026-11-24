import { AMBIENT_CELSIUS, NotWrittenYet, type Node, type Part, type Readings, type Stamp } from '../types';

const FILE = 'packages/engine/src/lesson-1-light-an-led/led.ts';

/** What an LED's datasheet says, plus two numbers fitted to its graphs. */
export interface LedSpec {
  /** Typical voltage across the whole LED (the datasheet's "VF")… */
  readonly forwardVolts: number;
  /** …at this current, A. */
  readonly typicalAmps: number;
  /** Most current it's rated for continuously ("DC forward current"), A. */
  readonly maxAmps: number;
  /** How gently the diode's exponential bends: n, fitted to the I–V graph. */
  readonly ideality: number;
  /** The chip and bond wire's resistance, in series with the diode, Ω. Fitted to the same graph. */
  readonly seriesOhms: number;
  /** Degrees hotter per watt, junction to air ("Rth JA"), K/W. */
  readonly kelvinPerWatt: number;
  /** Energy to warm the junction and lead frame by one degree, J/K. */
  readonly joulesPerKelvin: number;
  /** Hottest the junction survives ("Tj"), °C. */
  readonly maxJunctionCelsius: number;
}

/**
 * Kingbright WP7113ID, a 5 mm high-efficiency red LED (datasheet V.14A,
 * January 2026): VF 1.9 V typical at 10 mA, 30 mA DC maximum, Rth JA 560 °C/W,
 * Tj 125 °C. Ideality and series resistance are fitted to its forward current
 * vs. forward voltage graph (to within about 15 mV). Heat capacity isn't on
 * the datasheet; that one is an estimate.
 */
export const RED_LED: LedSpec = {
  forwardVolts: 1.9,
  typicalAmps: 0.01,
  maxAmps: 0.03,
  ideality: 2.8,
  seriesOhms: 6.6,
  kelvinPerWatt: 560,
  joulesPerKelvin: 0.005,
  maxJunctionCelsius: 125,
};

/**
 * LED: your first part. Read resistor.ts and battery.ts first; between them
 * they use every tool you'll need.
 *
 * What an LED does
 *   Below about 1.5 V it passes almost nothing, so it stays dark. Past that it
 *   suddenly conducts, and the current climbs exponentially. That's why it
 *   always needs a resistor in front of it: on its own it takes all the
 *   current the battery can push, overheats, and dies.
 *
 * Inside, it's two things in series:
 *
 *   anode ──▶|── junction ──/\/\/── cathode
 *         the diode      spec.seriesOhms
 *
 * The diode follows the Shockley equation:
 *
 *     amps = Is × (e^(volts / (n × Vt)) − 1)
 *
 *     Vt = 0.025852 V   thermal voltage at room temperature
 *     n  = spec.ideality
 *     Is                a tiny current. Choose it so that at spec.typicalAmps
 *                       the whole LED drops spec.forwardVolts. Careful: part of
 *                       that voltage is across the series resistance.
 *
 * Your three jobs
 *   1. stamp(s): s.internal('junction') gives you a private node for the point
 *      between the two; keep it. Then s.junction() for the diode and
 *      s.conductance() for the resistance. A Curve has current(volts) and
 *      slope(volts); slope is the derivative of current, and the solver aims
 *      its next guess with it.
 *   2. current(r): the current through you. The series resistance makes this
 *      one line.
 *   3. settle(r, dt): heat. Power in is amps × the volts across the whole LED.
 *      Feed it to a ThermalMass built from the spec (resistor.ts does the
 *      same), keep `temperature` up to date, and once the junction passes
 *      spec.maxJunctionCelsius, burn out: set `burnt` and pass nothing.
 *
 * Check yourself
 *   pnpm test:watch   the LED tests go from "todo" to passing
 *   pnpm dev          then drag the resistor and watch it glow, or burn
 */
export class Led implements Part {
  /** True once it has burnt out. A burnt LED lets nothing through. */
  burnt = false;
  /** Junction temperature, °C. */
  temperature = AMBIENT_CELSIUS;

  constructor(
    readonly name: string,
    readonly anode: Node,
    readonly cathode: Node,
    readonly spec: LedSpec = RED_LED,
  ) {}

  stamp(s: Stamp): void {
    throw new NotWrittenYet(this.name, FILE);
  }

  current(r: Readings): number {
    throw new NotWrittenYet(this.name, FILE);
  }

  settle(r: Readings, dt: number): void {
    throw new NotWrittenYet(this.name, FILE);
  }
}
