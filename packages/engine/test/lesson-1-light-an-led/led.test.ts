/**
 * Tests for your LED (packages/engine/src/lesson-1-light-an-led/led.ts), against the
 * Kingbright WP7113ID datasheet. They show as "todo" until stamp() stops
 * throwing NotWrittenYet, then they start checking.
 */
import { describe, expect, it } from 'vitest';
import { AMBIENT_CELSIUS, Battery, Circuit, GROUND, Led, RED_LED, Resistor } from '../../src/index';
import { expectConserved, FixedCurrent, isWritten, run, Source, SpyStamp } from '../fixtures';

/** An LED on its own, to inspect what it stamps. */
function looseLed(): Led {
  return new Led('D1', new Circuit().node('anode'), GROUND);
}

const written = isWritten(() => {
  looseLed().stamp(new SpyStamp());
});

/** An LED with an exact voltage held across it. */
function ledAt(volts: number) {
  const c = new Circuit();
  const anode = c.node('anode');
  const source = c.add(new Source('V1', anode, GROUND, volts));
  const led = c.add(new Led('D1', anode, GROUND));
  c.step(0);
  return { c, amps: c.currentThrough(source) ?? Number.NaN, led };
}

/** An LED with an exact current forced through it. */
function ledCarrying(amps: number) {
  const c = new Circuit();
  const anode = c.node('anode');
  const source = c.add(new FixedCurrent('I1', GROUND, anode, amps));
  const led = c.add(new Led('D1', anode, GROUND));
  return { c, source, led };
}

/** A battery, a resistor and the LED: build 1. */
function ledWithResistor(volts: number, batteryOhms: number, ohms: number) {
  const c = new Circuit();
  const plus = c.node('plus');
  const mid = c.node('mid');
  c.add(new Battery('B1', plus, GROUND, volts, batteryOhms));
  const resistor = c.add(new Resistor('R1', plus, mid, ohms));
  const led = c.add(new Led('D1', mid, GROUND));
  return { c, mid, resistor, led };
}

describe.runIf(written)('LED', () => {
  describe('the curve', () => {
    it('stays dark below about 1.5 V', () => {
      expect(ledAt(1.45).amps).toBeLessThan(1e-4);
    });

    it('drops its datasheet forward voltage at its test current', () => {
      // Datasheet: VF 1.9 V typical at 10 mA.
      const { amps } = ledAt(RED_LED.forwardVolts);
      expect(amps).toBeGreaterThan(RED_LED.typicalAmps * 0.85);
      expect(amps).toBeLessThan(RED_LED.typicalAmps * 1.15);
    });

    it('follows the datasheet graph to 20 mA at about 2.0 V', () => {
      const { amps } = ledAt(2.0);
      expect(amps).toBeGreaterThan(0.015);
      expect(amps).toBeLessThan(0.025);
    });

    it('blocks current the wrong way round', () => {
      // Datasheet: at most 10 µA at 5 V reverse.
      expect(Math.abs(ledAt(-5).amps)).toBeLessThan(10e-6);
    });

    it('has a slope that matches its current', () => {
      const spy = new SpyStamp();
      looseLed().stamp(spy);
      expect(spy.curves, 'stamp() should describe the diode with s.junction() once').toHaveLength(1);
      const [curve] = spy.curves;
      for (const v of [0.5, 1.5, 1.8, 1.9, 2.0]) {
        const h = 1e-6;
        const numeric = (curve.current(v + h) - curve.current(v - h)) / (2 * h);
        const error = Math.abs(curve.slope(v) - numeric);
        expect(error, `slope at ${String(v)} V`).toBeLessThan(1e-4 * Math.abs(numeric) + 1e-15);
      }
    });

    it('keeps its series resistance in mind at high current', () => {
      // A bare exponential would sit near 2.1 V at 100 mA; with 6.6 Ω in series it's well above.
      const { c, led } = ledCarrying(0.1);
      c.step(0);
      expect(c.across(led.anode, led.cathode)).toBeGreaterThan(2.5);
      expectConserved(c);
    });
  });

  describe('in a circuit', () => {
    it('lights at a sensible current with 9 V and 330 Ω', () => {
      // Hand maths: (9 V − about 2 V) / (330 Ω + 1.7 Ω) ≈ 21 mA.
      const { c, mid, led } = ledWithResistor(9, 1.7, 330);
      expect(c.step(0).converged).toBe(true);
      expect(c.voltage(mid)).toBeGreaterThan(1.9);
      expect(c.voltage(mid)).toBeLessThan(2.15);
      const amps = c.currentThrough(led) ?? Number.NaN;
      expect(amps).toBeGreaterThan(0.019);
      expect(amps).toBeLessThan(0.022);
      expectConserved(c);
    });

    it('reports the same current as the resistor in series with it', () => {
      const { c, resistor, led } = ledWithResistor(5, 0.2, 220);
      c.step(0);
      expect(c.currentThrough(led)).toBeCloseTo(c.currentThrough(resistor) ?? Number.NaN, 9);
      expectConserved(c);
    });
  });

  describe('heat', () => {
    it('starts at room temperature', () => {
      expect(looseLed().temperature).toBe(AMBIENT_CELSIUS);
    });

    it('runs warm but safe at its rated 30 mA', () => {
      // About 63 mW × 560 K/W ≈ 35 K above the air.
      const { c, led } = ledCarrying(RED_LED.maxAmps);
      run(c, 60);
      expect(led.burnt).toBe(false);
      expect(led.temperature).toBeGreaterThan(45);
      expect(led.temperature).toBeLessThan(80);
    });

    it('runs hotter with more current', () => {
      const rated = ledCarrying(RED_LED.maxAmps);
      const doubled = ledCarrying(RED_LED.maxAmps * 2);
      run(rated.c, 20);
      run(doubled.c, 20);
      expect(doubled.led.temperature).toBeGreaterThan(rated.led.temperature + 20);
    });

    it('cooks within seconds at 100 mA', () => {
      const { c, led } = ledCarrying(0.1);
      run(c, 10);
      expect(led.burnt).toBe(true);
    });

    it('shrugs off a short spike at its 160 mA peak rating', () => {
      const { c, source, led } = ledCarrying(0.16);
      run(c, 0.005);
      source.amps = RED_LED.typicalAmps;
      run(c, 2);
      expect(led.burnt).toBe(false);
    });

    it('dies almost instantly with no resistor', () => {
      const { c, led } = ledWithResistor(9, 1.7, 0.01);
      run(c, 0.2);
      expect(led.burnt).toBe(true);
    });

    it('lets nothing through once burnt, and cools down', () => {
      const { c, resistor, led } = ledWithResistor(9, 1.7, 0.01);
      run(c, 0.2);
      expect(led.burnt).toBe(true);
      c.step(0);
      expect(Math.abs(c.currentThrough(resistor) ?? Number.NaN)).toBeLessThan(1e-6);
      expectConserved(c);
      const hot = led.temperature;
      run(c, 20);
      expect(led.temperature).toBeLessThan(hot);
    });
  });
});

if (!written) {
  it.todo('LED: yours to write in packages/engine/src/lesson-1-light-an-led/led.ts');
}
