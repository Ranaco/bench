import { ESP32_GPIO, Gpio, type GpioSpec } from '../models/gpio/default';
import type { GpioModel, ModuleClasses } from '../models/contracts';
import type { Branch, Node, Part, Readings, Stamp } from '../types';

/**
 * ESP32: the chip on an ESP32 dev board, as far as the circuit sees it. Its 3V3 pin is held at 3.3 V above its GND
 * pin, and each GPIO is one of your pins. The board's own regulator, which makes that 3.3 V from USB's 5 V, is taken
 * to be perfect: a simplification.
 *
 * It's a part like any other, made of other parts: it stamps its supply, then each pin. Until your pin's stamp() is
 * written, the whole chip stays out of the circuit.
 */
export class Esp32 implements Part {
  /** Each GPIO by its number: GPIO4 is pins.get(4). */
  readonly pins: ReadonlyMap<number, GpioModel>;
  private branch = 0 as Branch;

  constructor(
    readonly name: string,
    /** The 3V3 pin. */
    readonly vdd: Node,
    /** The GND pin. */
    readonly gnd: Node,
    /** The node on each GPIO pin, by its number. */
    gpios: Readonly<Record<number, Node>>,
    readonly spec: GpioSpec = ESP32_GPIO,
    /** More GND pins, joined to `gnd` inside the board. */
    readonly grounds: readonly Node[] = [],
    /** Pins that can only read (on an ESP32, GPIO34 to 39): no output driver, no pull-up or pull-down. */
    readonly inputOnly: ReadonlySet<number> = new Set(),
    /** The code for one pin: yours from Lesson 6, or Bench's. */
    gpio: ModuleClasses['gpio'] = Gpio,
  ) {
    this.pins = new Map(Object.entries(gpios).map(([number, node]) => [Number(number), new gpio(name, node, vdd, gnd, spec)]));
  }

  stamp(s: Stamp): void {
    this.branch = s.voltageSource(this.vdd, this.gnd, this.spec.supplyVolts);
    // The board's other GND pins: the same ground, joined by its copper.
    for (const ground of this.grounds) s.voltageSource(ground, this.gnd, 0);
    for (const gpio of this.pins.values()) gpio.stamp(s);
  }

  /** The current out of the 3V3 pin into everything the chip powers, its own pins included. */
  current(r: Readings): number {
    return r.branchCurrent(this.branch);
  }
}
