/**
 * Bench's default LED: what every LED runs once Lesson 1, Light an LED is finished, and what the tests check the
 * engine and the board against. The learner writes their own in that lesson; theirs is kept, and can be switched to.
 */
import { ThermalMass } from '../../thermal';
import { AMBIENT_CELSIUS, THERMAL_VOLTAGE, type Curve, type Node, type Part, type Readings, type Stamp } from '../../types';

export interface LedSpec {
  readonly forwardVolts: number;
  readonly typicalAmps: number;
  readonly maxAmps: number;
  readonly ideality: number;
  readonly seriesOhms: number;
  readonly kelvinPerWatt: number;
  readonly joulesPerKelvin: number;
  readonly maxJunctionCelsius: number;
}

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

export class Led implements Part {
  burnt = false;
  temperature = AMBIENT_CELSIUS;
  private readonly curve: Curve;
  private readonly heat: ThermalMass;
  private junctionNode: Node | undefined;

  constructor(
    readonly name: string,
    readonly anode: Node,
    readonly cathode: Node,
    readonly spec: LedSpec = RED_LED,
  ) {
    const nVt = spec.ideality * THERMAL_VOLTAGE;
    const junctionVolts = spec.forwardVolts - spec.typicalAmps * spec.seriesOhms;
    const is = spec.typicalAmps / Math.expm1(junctionVolts / nVt);
    this.curve = {
      current: (v) => is * Math.expm1(v / nVt),
      slope: (v) => (is / nVt) * Math.exp(v / nVt),
    };
    this.heat = new ThermalMass(spec.kelvinPerWatt, spec.joulesPerKelvin);
  }

  stamp(s: Stamp): void {
    if (this.burnt) return;
    this.junctionNode = s.internal('junction');
    s.junction(this.anode, this.junctionNode, this.curve);
    s.conductance(this.junctionNode, this.cathode, 1 / this.spec.seriesOhms);
  }

  current(r: Readings): number {
    if (this.burnt || this.junctionNode === undefined) return 0;
    return r.across(this.junctionNode, this.cathode) / this.spec.seriesOhms;
  }

  settle(r: Readings, dt: number): void {
    const watts = this.current(r) * r.across(this.anode, this.cathode);
    this.temperature = this.heat.update(watts, dt, r.ambient);
    if (this.temperature > this.spec.maxJunctionCelsius) this.burnt = true;
  }
}
