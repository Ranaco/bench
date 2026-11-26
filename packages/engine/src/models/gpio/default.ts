/**
 * Bench's default GPIO pin: what every GPIO pin runs once Lesson 6, A microcontroller is finished, and what the tests check the
 * engine and the board against. The learner writes their own in that lesson; theirs is kept, and can be switched to.
 */
import type { Node, Part, Readings, Stamp } from '../../types';

/** What a microcontroller's datasheet says about one of its pins. */
export interface GpioSpec {
  /** The chip's supply, VDD, V. */
  readonly supplyVolts: number;
  /** At or above this, the pin is sure to read HIGH ("VIH", the least), V. */
  readonly highAbove: number;
  /** At or below this, it's sure to read LOW ("VIL", the most), V. */
  readonly lowBelow: number;
  /** Most current that leaks in or out of a pin that's only reading ("IIH", "IIL"), A. */
  readonly leakAmps: number;
  /** The internal pull-up (and pull-down) resistor ("RPU", "RPD", typical), Ω. */
  readonly pullOhms: number;
  /** An output driving HIGH, as a resistance to the supply, Ω. Worked out from the datasheet's drive figures. */
  readonly highOhms: number;
  /** An output driving LOW, as a resistance to ground, Ω. Worked out the same way. */
  readonly lowOhms: number;
  /** Current an output is rated to give while still reading as HIGH ("IOH", typical), A… */
  readonly sourceAmps: number;
  /** …and to take while still reading as LOW ("IOL", typical), A. */
  readonly sinkAmps: number;
  /** Highest voltage a pin may be given ("VIH" max, VDD + 0.3), V. */
  readonly maxVolts: number;
}

/**
 * ESP32, from Espressif's ESP32 Series Datasheet v5.3, Table 5-3 (DC characteristics at 3.3 V, 25 °C). VIH at least
 * 0.75 × VDD, VIL at most 0.25 × VDD, 50 nA of leakage at most, 45 kΩ pull resistors (typical). The drive figures are
 * typical, and only given at maximum drive strength: 40 mA out while the pin stays at 2.64 V or above, and 28 mA in
 * at 0.495 V. As resistances, (3.3 − 2.64) V ÷ 40 mA = 16.5 Ω and 0.495 V ÷ 28 mA = 17.7 Ω.
 */
export const ESP32_GPIO: GpioSpec = {
  supplyVolts: 3.3,
  highAbove: 0.75 * 3.3,
  lowBelow: 0.25 * 3.3,
  leakAmps: 50e-9,
  pullOhms: 45e3,
  highOhms: (3.3 - 2.64) / 0.04,
  lowOhms: 0.495 / 0.028,
  sourceAmps: 0.04,
  sinkAmps: 0.028,
  maxVolts: 3.3 + 0.3,
};

/** How a pin is set up: reading on its own, reading with a pull-up or pull-down, or driving. */
export type GpioMode = 'input' | 'pullup' | 'pulldown' | 'output';

/** What a pin reads: HIGH, LOW, or not sure either way. */
export type Level = 'high' | 'low' | 'unknown';

/**
 * GPIO pin: your sixth part, one pin of a microcontroller. A "general purpose input/output" pin can do two jobs, and
 * your program picks which with pinMode().
 *
 * As an input it reads the voltage on it, against the chip's ground, as HIGH or LOW. The datasheet promises HIGH at
 * or above `highAbove` and LOW at or below `lowBelow`; in between, it could read either. An input takes almost no
 * current: so little that with nothing wired to it, the pin's voltage is anyone's guess. That's a floating pin. A
 * pull-up (or pull-down) resistor inside the chip fixes that: switched on, it gently ties the pin to 3.3 V (or 0 V),
 * so it reads HIGH (or LOW) until something stronger pulls it the other way.
 *
 * As an output it drives the pin to 3.3 V (HIGH) or 0 V (LOW), through a small resistance: the transistors inside
 * the chip that do the driving aren't perfect.
 *
 *   3V3 ──┬──────────────┐
 *     pull-up      highOhms (driving HIGH)
 *         │              │
 *   pin ──┴──────────────┤
 *         │              │
 *     pull-down    lowOhms (driving LOW)
 *   GND ──┴──────────────┘
 *
 * Your three jobs, in this order
 *   1. stamp(s): by this.mode. 'input' adds nothing. 'pullup' is a conductance from the pin to vdd of
 *      1 / spec.pullOhms; 'pulldown' the same to gnd. 'output' is a conductance to vdd of 1 / spec.highOhms while
 *      this.high, else to gnd of 1 / spec.lowOhms.
 *   2. read(volts, ohms): HIGH, LOW or 'unknown'. `volts` is the pin's voltage against the chip's ground; `ohms` is
 *      the resistance between them, as the rest of the circuit sees it. Up to spec.leakAmps can leak in or out, either
 *      way, and leakAmps × ohms is how far that could move the pin. Only call it HIGH if even pulled down by that much
 *      it's still at or above spec.highAbove; LOW if even pushed up by that much it's at or below spec.lowBelow.
 *   3. current(r): the amps out of the pin into the circuit (negative while it takes current in): through the pull
 *      resistor or the driver that stamp() put in, and 0 for a plain input.
 *
 * Check yourself
 *   pnpm test:watch   the GPIO tests go from "todo" to passing, job by job
 *   pnpm dev          then open Lesson 6
 */
export class Gpio implements Part {
  /** How it's set up; your program's pinMode() changes it. */
  mode: GpioMode = 'input';
  /** While it's an output: true drives HIGH, false drives LOW. Your program's digitalWrite() changes it. */
  high = false;

  constructor(
    readonly name: string,
    readonly pin: Node,
    /** The chip's 3.3 V supply, inside it. */
    readonly vdd: Node,
    /** The chip's ground. */
    readonly gnd: Node,
    readonly spec: GpioSpec = ESP32_GPIO,
  ) {}

  stamp(s: Stamp): void {
    switch (this.mode) {
      case 'input':
        return;
      case 'pullup':
        s.conductance(this.pin, this.vdd, 1 / this.spec.pullOhms);
        return;
      case 'pulldown':
        s.conductance(this.pin, this.gnd, 1 / this.spec.pullOhms);
        return;
      case 'output':
        if (this.high) s.conductance(this.pin, this.vdd, 1 / this.spec.highOhms);
        else s.conductance(this.pin, this.gnd, 1 / this.spec.lowOhms);
    }
  }

  read(volts: number, ohms: number): Level {
    const wobble = this.spec.leakAmps * ohms;
    if (volts - wobble >= this.spec.highAbove) return 'high';
    if (volts + wobble <= this.spec.lowBelow) return 'low';
    return 'unknown';
  }

  current(r: Readings): number {
    switch (this.mode) {
      case 'input':
        return 0;
      case 'pullup':
        return r.across(this.vdd, this.pin) / this.spec.pullOhms;
      case 'pulldown':
        return r.across(this.gnd, this.pin) / this.spec.pullOhms;
      case 'output':
        return this.high ? r.across(this.vdd, this.pin) / this.spec.highOhms : r.across(this.gnd, this.pin) / this.spec.lowOhms;
    }
  }
}
