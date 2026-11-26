/**
 * Tests for your GPIO pin (packages/engine/src/lesson-6-microcontroller/gpio.ts), against the ESP32 datasheet
 * (v5.3, Table 5-3). Each job's tests show as "todo" until that job is written, then they start checking.
 */
import { describe, expect, it } from 'vitest';
import { Circuit, ESP32_GPIO, Gpio, TICK, type GpioMode, type Node, type Readings } from '../../src/index';
import { FixedCurrent, isWritten, Source, SpyStamp } from '../fixtures';
import { implementations } from '../implementations';

/** The class under test: Bench's default, or yours. */
type GpioClass = typeof Gpio;

function suite(Gpio: GpioClass, label: string) {
  const PIN = 1 as Node;
  const VDD = 2 as Node;
  const GND = 3 as Node;

  /** A pin set up as `mode`, driving `high`. */
  function gpio(mode: GpioMode, high = false) {
    const pin = new Gpio('U1', PIN, VDD, GND);
    pin.mode = mode;
    pin.high = high;
    return pin;
  }

  /** What `gpio` stamps, and whether stamp() runs at all. */
  function stamped(pin: Gpio) {
    const spy = new SpyStamp();
    const runs = isWritten(() => {
      pin.stamp(spy);
    });
    return { spy, runs };
  }

  /** Readings with the pin at `pinVolts`, the supply at 3.3 V and the chip's ground at 0. */
  function readingsAt(pinVolts: number): Readings {
    const at = (node: Node) => (node === PIN ? pinVolts : node === VDD ? 3.3 : 0);
    return { time: 0, dt: TICK, ambient: 25, voltage: at, across: (a, b) => at(a) - at(b), branchCurrent: () => 0 };
  }

  // Written means it runs and does something: an emptied stamp() that adds nothing for a pull-up doesn't count yet.
  const pullup = stamped(gpio('pullup'));
  const stampWritten = pullup.runs && pullup.spy.conductances.length > 0;
  const readWritten = isWritten(() => {
    gpio('input').read(3.3, 0);
  });
  const currentWritten = isWritten(() => {
    gpio('pullup').current(readingsAt(0));
  });
  const allWritten = stampWritten && readWritten && currentWritten;

  describe.runIf(stampWritten)(`Gpio.stamp, job 1: what each mode puts on the pin (${label})`, () => {
    it('adds nothing as a plain input, and a 45 kΩ resistor to 3.3 V or to ground as a pull-up or pull-down', () => {
      expect(stamped(gpio('input')).spy.conductances).toEqual([]);
      expect(stamped(gpio('pullup')).spy.conductances).toEqual([{ a: PIN, b: VDD, siemens: 1 / 45e3 }]);
      expect(stamped(gpio('pulldown')).spy.conductances).toEqual([{ a: PIN, b: GND, siemens: 1 / 45e3 }]);
    });

    it('drives HIGH through 16.5 Ω to 3.3 V, and LOW through 17.7 Ω to ground', () => {
      const high = stamped(gpio('output', true)).spy.conductances;
      expect(high.map(({ a, b }) => [a, b])).toEqual([[PIN, VDD]]);
      expect(1 / (high.at(0)?.siemens ?? 0)).toBeCloseTo(16.5, 9);
      const low = stamped(gpio('output', false)).spy.conductances;
      expect(low.map(({ a, b }) => [a, b])).toEqual([[PIN, GND]]);
      expect(1 / (low.at(0)?.siemens ?? 0)).toBeCloseTo(0.495 / 0.028, 9);
    });
  });

  describe.runIf(readWritten)(`Gpio.read, job 2: HIGH, LOW, or could be either (${label})`, () => {
    it('reads HIGH at or above 0.75 × 3.3 V and LOW at or below 0.25 × 3.3 V, firmly held', () => {
      const pin = gpio('input');
      expect(pin.read(3.3, 0)).toBe('high');
      expect(pin.read(0.75 * 3.3, 0)).toBe('high');
      expect(pin.read(0, 0)).toBe('low');
      expect(pin.read(0.25 * 3.3, 0)).toBe('low');
    });

    it('can’t say between the two', () => {
      const pin = gpio('input');
      expect(pin.read(1.65, 0)).toBe('unknown');
      expect(pin.read(0.75 * 3.3 - 0.001, 0)).toBe('unknown');
      expect(pin.read(0.25 * 3.3 + 0.001, 0)).toBe('unknown');
    });

    it('can’t say when its 50 nA leak could move it across a line: behind an open button, yes; a pull-up, no', () => {
      const pin = gpio('input');
      expect(pin.read(3.3, 100e6)).toBe('unknown'); // 50 nA × 100 MΩ = 5 V
      expect(pin.read(3.3, 45e3)).toBe('high'); // 50 nA × 45 kΩ = 2.25 mV
      expect(pin.read(0.75 * 3.3 + 0.001, 45e3)).toBe('unknown'); // 1 mV clear isn't clear of 2.25 mV
    });
  });

  describe.runIf(currentWritten)(`Gpio.current, job 3: amps out of the pin (${label})`, () => {
    it('gives nothing as an input, and Ohm’s law through the pull resistor or the driver otherwise', () => {
      expect(gpio('input').current(readingsAt(1))).toBe(0);
      expect(gpio('pullup').current(readingsAt(0))).toBeCloseTo(3.3 / 45e3, 12);
      expect(gpio('pulldown').current(readingsAt(3.3))).toBeCloseTo(-3.3 / 45e3, 12);
      expect(gpio('output', true).current(readingsAt(3))).toBeCloseTo(0.3 / 16.5, 12);
      expect(gpio('output', false).current(readingsAt(0.495))).toBeCloseTo(-0.028, 12); // taking 28 mA in
    });
  });

  describe.runIf(allWritten)(`Gpio in a circuit, against the datasheet (${label})`, () => {
    /** A pin driving into a fixed current, with the chip's supply between 3V3 and GND. */
    function driving(high: boolean, amps: number) {
      const c = new Circuit();
      const pin = c.node('pin');
      const vdd = c.node('3V3');
      const gnd = c.node('GND');
      c.add(new Source('VDD', vdd, gnd, ESP32_GPIO.supplyVolts));
      const gpioPart = new Gpio('U1', pin, vdd, gnd);
      gpioPart.mode = 'output';
      gpioPart.high = high;
      c.add(gpioPart);
      c.add(high ? new FixedCurrent('LOAD', pin, gnd, amps) : new FixedCurrent('LOAD', vdd, pin, amps));
      c.step(0);
      return c.across(pin, gnd);
    }

    it('stays at 2.64 V giving 40 mA, and at 0.495 V taking 28 mA: the datasheet’s typical figures', () => {
      expect(driving(true, 0.04)).toBeCloseTo(2.64, 9);
      expect(driving(false, 0.028)).toBeCloseTo(0.495, 9);
    });
  });

  if (!stampWritten) it.todo(`Gpio.stamp, job 1: what each mode puts on the pin (${label})`);
  if (!readWritten) it.todo(`Gpio.read, job 2: HIGH, LOW, or could be either (${label})`);
  if (!currentWritten) it.todo(`Gpio.current, job 3: amps out of the pin (${label})`);
}

for (const { label, code } of implementations('gpio')) suite(code as unknown as GpioClass, label);
