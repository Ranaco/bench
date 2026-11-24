import { Capacitor } from '../models/capacitor/default';
import type { CapacitorModel, ModuleClasses } from '../models/contracts';
import { NotWrittenYet, type Node, type Part, type Readings, type Stamp } from '../types';
import { TICK } from '../circuit';

/** What an electrolytic capacitor's datasheet says, for one part in its series. */
export interface ElectrolyticSpec {
  /** Rated capacitance, F (±20 % at 120 Hz on the datasheet; the nominal is used). */
  readonly farads: number;
  /** Rated voltage, V: the most it may hold. */
  readonly ratedVolts: number;
  /** Most it may leak after 2 minutes at its rated voltage, A. */
  readonly leakAmps: number;
  /** Loss at 120 Hz (tan δ), the most allowed. Shown, not simulated: nothing here is fast enough for it to matter. */
  readonly tanDelta: number;
  /** Rated ripple current at 85 °C and 120 Hz, A rms. Shown, not simulated. */
  readonly rippleAmps: number;
  /** Case diameter, mm. */
  readonly diameterMm: number;
  /** Case length, mm. */
  readonly lengthMm: number;
  /** Spacing between the leads, mm. */
  readonly leadSpacingMm: number;
  /** Lead diameter, mm. */
  readonly leadDiameterMm: number;
}

/** The leads by case diameter, from the UVR datasheet's radial lead table. */
const LEADS = {
  8: { leadSpacingMm: 3.5, leadDiameterMm: 0.6 },
  10: { leadSpacingMm: 5, leadDiameterMm: 0.6 },
  12.5: { leadSpacingMm: 5, leadDiameterMm: 0.6 },
} as const;

const uvr25 = (microfarads: number, size: readonly [8 | 10 | 12.5, number], tanDelta: number, leakMicroamps: number, rippleMilliamps: number): ElectrolyticSpec => ({
  farads: microfarads * 1e-6,
  ratedVolts: 25,
  leakAmps: leakMicroamps * 1e-6,
  tanDelta,
  rippleAmps: rippleMilliamps * 1e-3,
  diameterMm: size[0],
  lengthMm: size[1],
  ...LEADS[size[0]],
});

/**
 * Nichicon UVR, the standard radial electrolytic, 25 V (datasheet CAT.8100M):
 * one row of its dimensions table each, as printed. Leakage is the "at 20 °C
 * after 2 minutes" column, which is 0.01 × µF × V in µA for every one.
 */
export const UVR_25V = {
  220: uvr25(220, [8, 11.5], 0.16, 55, 330),
  330: uvr25(330, [10, 12.5], 0.16, 82.5, 440),
  470: uvr25(470, [10, 12.5], 0.16, 117.5, 550),
  1000: uvr25(1000, [10, 20], 0.16, 250, 960),
  2200: uvr25(2200, [12.5, 25], 0.18, 550, 1550),
} as const satisfies Record<number, ElectrolyticSpec>;

const READINGS_AT_REST: Readings = {
  time: 0,
  dt: TICK,
  ambient: 25,
  voltage: () => 0,
  across: () => 0,
  branchCurrent: () => 0,
};

/**
 * An electrolytic capacitor: your capacitor, the leak its datasheet allows,
 * and a plus and a minus leg. The plates are foil, one of them coated in an
 * oxide layer that only insulates one way round, so it has a + and a −.
 *
 *   plus ──┬── your capacitor ──┬── minus
 *          └──── its leak ──────┘
 *
 * The leak is the most the datasheet allows after 2 minutes at its rated
 * voltage, as a resistance: rated volts ÷ those amps. A real one leaks less
 * as it sits charged, and less at lower voltages, so this is the worst it
 * may be. Either way it slowly empties a capacitor left on its own: by
 * 0.01 × µF × V µA, every one in the series takes about 100 seconds.
 */
export class Electrolytic implements Part {
  readonly inner: CapacitorModel;
  /**
   * Set while your capacitor can't remember yet (its settle isn't written).
   * Until it can, it stays out of the circuit: without a memory it would act
   * like a plain resistor.
   */
  private readonly forgets: NotWrittenYet | undefined;

  constructor(
    readonly name: string,
    readonly plus: Node,
    readonly minus: Node,
    readonly spec: ElectrolyticSpec = UVR_25V[1000],
    /** The code for the capacitor inside: yours from Lesson 4, or Bench's. */
    capacitor: ModuleClasses['capacitor'] = Capacitor,
  ) {
    this.inner = new capacitor(name, plus, minus, spec.farads);
    this.forgets = settleMissing(this.inner);
  }

  /** The leak as a resistance, Ω. */
  get leakOhms(): number {
    return this.spec.ratedVolts / this.spec.leakAmps;
  }

  /** Volts it's holding, plus to minus. */
  get held(): number {
    return this.inner.held;
  }

  stamp(s: Stamp): void {
    if (this.forgets) throw this.forgets;
    this.inner.stamp(s);
    s.conductance(this.plus, this.minus, 1 / this.leakOhms);
  }

  /** Amps in at plus: what charges your capacitor, and what leaks across. */
  current(r: Readings): number {
    return this.inner.current(r) + r.across(this.plus, this.minus) / this.leakOhms;
  }

  settle(r: Readings, dt: number): void {
    this.inner.settle(r, dt);
  }
}

/** Asks a new capacitor's settle once, with nothing across it (so it learns 0 V): is it written yet? */
function settleMissing(capacitor: CapacitorModel): NotWrittenYet | undefined {
  try {
    capacitor.settle(READINGS_AT_REST, TICK);
  } catch (error) {
    if (error instanceof NotWrittenYet) return error;
    // Written, just wrong: the circuit shows the error when it runs it.
  }
  return undefined;
}
