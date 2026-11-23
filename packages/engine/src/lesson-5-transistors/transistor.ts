import { GROUND, NotWrittenYet, THERMAL_VOLTAGE, type Curve, type Node, type Part, type Readings, type Stamp } from '../types';

const FILE = 'packages/engine/src/lesson-5-transistors/transistor.ts';

/** What a transistor's datasheet says, and the maker's own model of it. */
export interface TransistorSpec {
  /** The junctions' saturation current, A: how much a junction leaks before it turns on (SPICE "Is"). */
  readonly saturationAmps: number;
  /** Forward gain: collector current ÷ base current, while it amplifies (SPICE "Bf"). */
  readonly forwardGain: number;
  /** The same, run backwards with collector and emitter swapped: far worse (SPICE "Br"). */
  readonly reverseGain: number;
  /** Resistance of the base's lead and silicon, Ω (SPICE "Rb"). */
  readonly baseOhms: number;
  /** Resistance of the collector's, Ω (SPICE "Rc"). */
  readonly collectorOhms: number;
  /** Most collector current it's rated for, A ("IC"). */
  readonly maxCollectorAmps: number;
  /** Most volts collector to emitter, with the base open ("VCEO"). */
  readonly maxCollectorVolts: number;
  /** Most power it can turn into heat in air at 25 °C ("PD"), W. */
  readonly maxWatts: number;
}

/**
 * PN2222A, an NPN transistor in a TO-92 case (legs E, B, C), now sold by
 * onsemi as the KSP2222A. The model's numbers are from the SPICE model
 * printed on Fairchild's PN2222A datasheet (Rev. A1, August 2004); the
 * limits are from onsemi's KSP2222A datasheet (Rev. 2, October 2023), which
 * rates the collector for 600 mA (Fairchild's 2014 PN2222A sheet says 1.0 A;
 * the newer, lower figure wins).
 */
export const PN2222A: TransistorSpec = {
  saturationAmps: 14.34e-15,
  forwardGain: 255.9,
  reverseGain: 6.092,
  baseOhms: 10,
  collectorOhms: 1,
  maxCollectorAmps: 0.6,
  maxCollectorVolts: 40,
  maxWatts: 0.625,
};

/** Written for you. A junction's current at `volts`, Shockley's equation, scaled by `share`, as a Curve. */
function junctionCurve(saturationAmps: number, share = 1): Curve {
  const amps = share * saturationAmps;
  return {
    current: (volts) => amps * Math.expm1(volts / THERMAL_VOLTAGE),
    slope: (volts) => (amps / THERMAL_VOLTAGE) * Math.exp(volts / THERMAL_VOLTAGE),
  };
}

/**
 * Transistor (NPN): your fifth part, and the first with three legs that does
 * something none of your others can. A small current into the base lets a
 * current hundreds of times bigger flow from the collector to the emitter.
 *
 * Inside it's two diodes, back to back, sharing the base:
 *
 *         collector
 *             │
 *   base ──▶|─┤       the base-collector diode
 *         ──▶|─┤      the base-emitter diode
 *             │
 *          emitter
 *
 * On their own, two diodes like that would never let current flow from the
 * collector to the emitter: whichever way you try, one of them blocks. The
 * trick is how thin the base is. Current pushed into the base, across the
 * base-emitter diode, mostly doesn't leave by the base at all: it's swept
 * straight through to the collector. So the base-emitter voltage controls a
 * current from collector to emitter, `forwardGain` times bigger than the base
 * current itself. That's the transistor action, and it's what
 * s.controlledCurrent() describes: a current between two nodes, set by the
 * voltage between two others.
 *
 * It works backwards too, collector and emitter swapped, just far worse
 * (`reverseGain`). That backwards half is what stops a transistor that's
 * switched fully on from pulling its collector below its emitter.
 *
 * Written for you: the curves (Shockley's equation, like your LED's diode,
 * with the maker's numbers), and leads(s), which puts the small resistances
 * of the base and collector in front of the transistor proper and gives you
 * the nodes just inside them.
 *
 * Your jobs, in this order
 *   1. stamp(s): the two diodes. After leads(s), one s.junction() from the
 *      inside base to the emitter (this.baseEmitter), and one from the inside
 *      base to the inside collector (this.baseCollector). That's all the base
 *      current there is. Measured like that, with nothing more, a transistor
 *      is just two diodes; it's how you test one with a meter.
 *   2. stamp(s), again: the transistor action. Two s.controlledCurrent()s,
 *      both with this.transfer as the curve:
 *        - forwards: from the inside collector to the emitter, set by the
 *          voltage from the inside base to the emitter;
 *        - backwards: from the emitter to the inside collector, set by the
 *          voltage from the inside base to the inside collector.
 *   3. current(r): the collector current. It all flows through the
 *      collector's resistance, so it's one line, like your LED's.
 *
 * Check yourself
 *   pnpm test:watch   the transistor tests go from "todo" to passing, job by job
 *   pnpm dev          then open Lesson 5
 */
export class Transistor implements Part {
  /** The base-emitter diode: its share of the base current. */
  readonly baseEmitter: Curve;
  /** The base-collector diode: its share. */
  readonly baseCollector: Curve;
  /** The current the base's voltage sets between collector and emitter. */
  readonly transfer: Curve;
  /** The nodes just inside the base and collector leads, once leads() has run. */
  inside = { base: GROUND, collector: GROUND };

  constructor(
    readonly name: string,
    readonly collector: Node,
    readonly base: Node,
    readonly emitter: Node,
    readonly spec: TransistorSpec = PN2222A,
  ) {
    this.baseEmitter = junctionCurve(spec.saturationAmps, 1 / spec.forwardGain);
    this.baseCollector = junctionCurve(spec.saturationAmps, 1 / spec.reverseGain);
    this.transfer = junctionCurve(spec.saturationAmps);
  }

  /** Written for you. The base and collector leads' resistances; returns the nodes inside them. */
  leads(s: Stamp): { base: Node; collector: Node } {
    this.inside = { base: s.internal('base'), collector: s.internal('collector') };
    s.conductance(this.base, this.inside.base, 1 / this.spec.baseOhms);
    s.conductance(this.collector, this.inside.collector, 1 / this.spec.collectorOhms);
    return this.inside;
  }

  /** Written for you. The current into the base, through its resistance. */
  baseCurrent(r: Readings): number {
    return r.across(this.base, this.inside.base) / this.spec.baseOhms;
  }

  stamp(s: Stamp): void {
    // Written for you, and it stays first: the leads. Keep what it returns (const { base, collector } = …).
    this.leads(s);
    throw new NotWrittenYet(this.name, FILE);
  }

  current(r: Readings): number {
    throw new NotWrittenYet(this.name, FILE);
  }
}

