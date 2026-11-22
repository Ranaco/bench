import { describe, expect, it } from 'vitest';
import { awgArea, Circuit, conductorOhms, COPPER, GROUND, JUMPER, Resistor, Wire } from '../../src/index';
import { expectConserved, Source } from '../fixtures';

describe('wire sizes and copper', () => {
  it('gives 22 AWG its standard cross-section, 0.326 mm²', () => {
    expect(awgArea(22) * 1e6).toBeCloseTo(0.3255, 3);
  });

  it('matches the published copper wire table: 22 AWG is 52.96 Ω per km at 20 °C', () => {
    expect(conductorOhms(COPPER, 1000, awgArea(22), 20)).toBeCloseTo(52.96, 1);
  });

  it('resists more when warm, by 0.393 % per degree', () => {
    const cold = conductorOhms(COPPER, 1, awgArea(22), 20);
    const warm = conductorOhms(COPPER, 1, awgArea(22), 30);
    expect(warm / cold).toBeCloseTo(1.0393, 6);
  });
});

describe('Wire', () => {
  it('is a 10 cm 22 AWG jumper by default: about 5.4 mΩ at room temperature', () => {
    const wire = new Wire('W1', new Circuit().node('a'), GROUND);
    expect(wire.ohmsAt(25) * 1000).toBeCloseTo(5.4, 1);
    expect(JUMPER.gauge).toBe(22);
  });

  it("drops volts by Ohm's law at high current", () => {
    const c = new Circuit();
    const top = c.node('top');
    const source = c.add(new Source('V1', top, GROUND, 0.054));
    const wire = c.add(new Wire('W1', top, GROUND));
    c.step(0);
    expect(c.currentThrough(wire)).toBeCloseTo(0.054 / wire.ohmsAt(25), 6);
    expect(c.currentThrough(source)).toBeCloseTo(c.currentThrough(wire) ?? Number.NaN, 6);
    expectConserved(c);
  });
});

describe('Resistor at 0 Ω', () => {
  it('refuses, naming the part, instead of dividing by zero', () => {
    const c = new Circuit();
    const top = c.node('top');
    c.add(new Source('V1', top, GROUND, 1));
    c.add(new Resistor('R1', top, GROUND, 0));
    expect(() => c.step(0)).toThrow(/R1\.stamp\(\) failed: a resistor needs more than 0 Ω.*use a Wire/);
  });
});
