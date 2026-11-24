/**
 * Tests for your switch (packages/engine/src/lesson-2-switches/switch.ts), against the
 * E-Switch TL1105 and EG1218 datasheets. They show as "todo" until stamp()
 * stops throwing NotWrittenYet, then they start checking.
 */
import { describe, expect, it } from 'vitest';
import {
  Battery,
  Circuit,
  ENERGIZER_522,
  GROUND,
  Led,
  Resistor,
  SLIDE_SWITCH,
  SlideSwitch,
  Switch,
  TACT_SWITCH,
} from '../../src/index';
import { expectConserved, isWritten, Source, SpyStamp } from '../fixtures';
import { implementations } from '../implementations';

/** The class under test: Bench's default, or yours. */
type SwitchClass = typeof Switch;

function suite(Switch: SwitchClass, label: string) {
  const written = isWritten(() => {
    new Switch('S1', new Circuit().node('a'), GROUND).stamp(new SpyStamp());
  });

  /** A switch with an exact voltage held across it. */
  function switchAt(volts: number, closed: boolean) {
    const c = new Circuit();
    const a = c.node('a');
    const source = c.add(new Source('V1', a, GROUND, volts));
    const button = c.add(new Switch('S1', a, GROUND, closed, TACT_SWITCH));
    c.step(0);
    return { c, source, button };
  }

  /** Build 1 with a slide switch between the battery and the resistor, common to the battery. */
  function ledLoopWithSwitch(side: 'a' | 'b') {
    const c = new Circuit();
    const plus = c.node('plus');
    const throwA = c.node('A');
    const throwB = c.node('B');
    const anode = c.node('anode');
    c.add(new Battery('B1', plus, GROUND, ENERGIZER_522.volts, ENERGIZER_522.ohms));
    const slide = c.add(new SlideSwitch('S1', plus, throwA, throwB, side, undefined, Switch));
    c.add(new Resistor('R1', throwA, anode, 330)); // the LED hangs off side A only
    const led = c.add(new Led('D1', anode, GROUND));
    return { c, slide, led, plus, throwA, throwB };
  }

  describe.runIf(written)(`Switch (${label})`, () => {
    it('closed: its contacts pass current with only their datasheet resistance in the way', () => {
      // TL1105: 100 mΩ max. 10 mV across it pushes 0.1 A.
      const { c, button } = switchAt(0.01, true);
      expect(c.currentThrough(button)).toBeCloseTo(0.01 / TACT_SWITCH.closedOhms, 9);
      expectConserved(c);
    });

    it('open: only what leaks through its insulation, 9 V / 100 MΩ = 90 nA', () => {
      const { c, button } = switchAt(9, false);
      expect(c.currentThrough(button)).toBeCloseTo(9 / TACT_SWITCH.openOhms, 15);
      expectConserved(c);
    });

    it('flips while running', () => {
      const { c, button } = switchAt(0.01, false);
      button.closed = true;
      c.step(0);
      expect(c.currentThrough(button)).toBeCloseTo(0.1, 9);
      button.closed = false;
      c.step(0);
      expect(c.currentThrough(button)).toBeLessThan(1e-9);
    });

    it('measures current from a to b, so it reads negative the other way round', () => {
      const { c, button } = switchAt(-0.01, true);
      expect(c.currentThrough(button)).toBeCloseTo(-0.1, 9);
    });
  });

  describe.runIf(written)(`SlideSwitch (${label})`, () => {
    it('lights the LED on the side it’s slid to, as if the switch were hardly there', () => {
      const { c, slide, led } = ledLoopWithSwitch('a');
      c.step(0);
      const amps = c.currentThrough(led) ?? Number.NaN;
      expect(amps).toBeGreaterThan(0.02); // about 22 mA, as in build 1
      // Every amp the LED takes comes through the switch.
      expect(c.currentThrough(slide)).toBeCloseTo(amps, 9);
      expectConserved(c);
    });

    it('slid away, the LED goes dark and the battery’s push sits across the open contacts', () => {
      const { c, slide, led, plus, throwA } = ledLoopWithSwitch('b');
      c.step(0);
      const leak = c.currentThrough(led) ?? Number.NaN;
      expect(leak).toBeLessThan(1e-6); // the datasheet graph's dimmest point is 0.3 mA: nothing to see
      // What the LED gets is what leaks across the open contact, by Ohm's law at its insulation resistance
      // (to 1 part in 10,000: the solver ties every node to ground through a millionth of a millionth of a siemens).
      const across = c.across(plus, throwA) / SLIDE_SWITCH.openOhms;
      expect(Math.abs(across - leak) / leak).toBeLessThan(1e-4);
      // Nearly all of the 9 V is across the gap: a voltmeter there reads most of the battery.
      expect(c.across(plus, throwA)).toBeGreaterThan(ENERGIZER_522.volts / 2);
      expect(slide.side).toBe('b');
      expectConserved(c);
    });

    it('never connects both sides at once', () => {
      const { slide } = ledLoopWithSwitch('a');
      slide.side = 'b';
      expect([slide.toA.closed, slide.toB.closed]).toEqual([false, true]);
      slide.side = 'a';
      expect([slide.toA.closed, slide.toB.closed]).toEqual([true, false]);
    });
  });

  if (!written) {
    it.todo(`Switch: yours to write in packages/engine/src/lesson-2-switches/switch.ts (${label})`);
  }
}

for (const { label, code } of implementations('switch')) suite(code as unknown as SwitchClass, label);
