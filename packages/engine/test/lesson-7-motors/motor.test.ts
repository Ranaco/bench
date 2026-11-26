/**
 * Tests for your motor (packages/engine/src/lesson-7-motors/motor.ts). They wait as "todo" until stamp() and
 * current() stop throwing NotWrittenYet; then each job's tests check it, in order: job 1's pass once you've written
 * it, job 2's once you've written that too, and so on.
 */
import { describe, expect, it } from 'vitest';
import {
  Battery,
  Circuit,
  Diode,
  ENERGIZER_522,
  FAULHABER_1516_009SR,
  GROUND,
  PN2222A,
  Resistor,
  TICK,
  Transistor,
  type Code,
  type Node,
  type Readings,
} from '../../src/index';
import { expectConserved, isWritten, Source, SpyStamp } from '../fixtures';
import { implementations } from '../implementations';

const SHEET = FAULHABER_1516_009SR;
/** Radians a second in one rpm. */
const RPM = (2 * Math.PI) / 60;

describe('The 1516 T 009 SR’s datasheet agrees with itself', () => {
  // A motor's numbers are tied together by a few laws; a misread one would break them. Within 1 %: the sheet rounds.
  it('turns as fast with nothing on it as its winding and friction allow: (UN − R × I0) ÷ kM', () => {
    const speed = (SHEET.volts - SHEET.ohms * SHEET.noLoadAmps) / SHEET.torquePerAmp;
    expect(speed / RPM / SHEET.noLoadRpm).toBeCloseTo(1, 1);
    expect(Math.abs(speed / RPM / SHEET.noLoadRpm - 1)).toBeLessThan(0.01);
  });

  it('holds with the torque its stall current makes, less friction: kM × UN ÷ R − MR', () => {
    const torque = (SHEET.torquePerAmp * SHEET.volts) / SHEET.ohms - SHEET.frictionTorque;
    expect(Math.abs(torque / SHEET.stallTorque - 1)).toBeLessThan(0.01);
  });

  it('spends its no-load current on friction: kM × I0 = MR', () => {
    expect(Math.abs((SHEET.torquePerAmp * SHEET.noLoadAmps) / SHEET.frictionTorque - 1)).toBeLessThan(0.01);
  });

  it('has a speed constant that’s its torque constant turned over: 1530 min⁻¹/V × 6.25 mNm/A = 60000 ÷ 2π', () => {
    expect(Math.abs((1530 * 6.25) / (60000 / (2 * Math.PI)) - 1)).toBeLessThan(0.01);
  });
});

/** The class under test: Bench's default, or yours. */
type MotorClass = Code['motor'];

function suite(Motor: MotorClass, label: string) {
  const PLUS = 1 as Node;
  const MINUS = 2 as Node;
  const readings: Readings = { time: 0, dt: TICK, ambient: 25, voltage: () => 0, across: () => 0, branchCurrent: () => 0 };
  const written =
    isWritten(() => new Motor('M1', PLUS, MINUS).current(readings)) && isWritten(() => {
      new Motor('M1', PLUS, MINUS).stamp(new SpyStamp());
    });

  /** A motor straight across `volts` (an ideal supply). */
  function across(volts: number) {
    const c = new Circuit();
    const top = c.node('top');
    c.add(new Source('V1', top, GROUND, volts));
    const motor = c.add(new Motor('M1', top, GROUND));
    return { c, motor };
  }

  if (!written) {
    it.todo(`Motor: stamp() and current(), job 1 first (${label})`);
    return;
  }

  describe(`Motor, job 1: held still, it's only its winding (${label})`, () => {
    it('lets 9 V push 9 ÷ 32.5 Ω through it, about 277 mA', () => {
      const { c, motor } = across(9);
      motor.held = true;
      c.step(0.05);
      expect(c.currentThrough(motor)).toBeCloseTo(9 / SHEET.ohms, 4);
      expect(motor.speed).toBe(0);
      expectConserved(c);
    });
  });

  describe(`Motor, job 2: it fights back (${label})`, () => {
    it('speeds up to its datasheet’s no-load speed, and its current falls to the no-load current', () => {
      const { c, motor } = across(SHEET.volts);
      c.step(1);
      expect(Math.abs(motor.speed / RPM / SHEET.noLoadRpm - 1)).toBeLessThan(0.015);
      expect(Math.abs((c.currentThrough(motor) ?? 0) / SHEET.noLoadAmps - 1)).toBeLessThan(0.02);
      expectConserved(c);
    });

    it('draws far more starting than running: the back-EMF is what holds the running current down', () => {
      const { c, motor } = across(SHEET.volts);
      c.step(TICK);
      const starting = c.currentThrough(motor) ?? 0;
      c.step(1);
      const running = c.currentThrough(motor) ?? 0;
      expect(starting).toBeGreaterThan(0.9 * (SHEET.volts / SHEET.ohms));
      expect(starting / running).toBeGreaterThan(10);
    });

    it('slows to a stop once let go of its supply, friction taking the speed off it', () => {
      const c = new Circuit();
      const top = c.node('top');
      const supply = c.add(new Source('V1', top, GROUND, SHEET.volts));
      const motor = c.add(new Motor('M1', top, GROUND));
      c.step(1);
      c.remove(supply); // nothing across it now but itself
      c.step(5);
      expect(motor.speed).toBe(0);
    });
  });

  /** The 9 V battery through the motor into a transistor, switched by a 3.3 V push on its base through 1 kΩ. */
  function switched(withDiode: boolean) {
    const c = new Circuit();
    const plus = c.node('plus');
    const collector = c.node('collector');
    const base = c.node('base');
    const pin = c.node('pin');
    c.add(new Battery('B1', plus, GROUND, ENERGIZER_522.volts, ENERGIZER_522.ohms));
    const motor = c.add(new Motor('M1', plus, collector));
    const q = c.add(new Transistor('Q1', collector, base, GROUND));
    c.add(new Resistor('R1', pin, base, 1000));
    const drive = c.add(new Source('V1', pin, GROUND, 3.3));
    if (withDiode) c.add(new Diode('D1', collector, plus));
    return { c, motor, q, drive };
  }

  describe(`Motor, job 3: a coil's current can't stop at once (${label})`, () => {
    it('kicks the transistor’s collector past its 40 V rating when switched off with nothing to catch it', () => {
      const { c, motor, q, drive } = switched(false);
      motor.held = true; // its full current, for the biggest kick
      c.step(0.1);
      q.takeHighest();
      drive.volts = 0;
      c.changed();
      c.step(TICK);
      expect(q.takeHighest()).toBeGreaterThan(PN2222A.maxCollectorVolts);
    });

    it('keeps it near the battery with a diode across it: the current goes round, through the diode', () => {
      const { c, motor, q, drive } = switched(true);
      motor.held = true;
      c.step(0.1);
      q.takeHighest();
      drive.volts = 0;
      c.changed();
      c.step(TICK);
      expect(q.takeHighest()).toBeLessThan(ENERGIZER_522.volts + 1.5);
      expectConserved(c);
    });
  });
}

for (const { code, label } of implementations('motor')) suite(code, label);
