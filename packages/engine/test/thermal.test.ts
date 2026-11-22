import { describe, expect, it } from 'vitest';
import { ThermalMass } from '../src/index';

describe('ThermalMass', () => {
  it('settles at ambient plus watts times thermal resistance', () => {
    const mass = new ThermalMass(100, 0.1, 25);
    mass.update(0.5, 1000, 25);
    expect(mass.celsius).toBeCloseTo(75, 9);
  });

  it('covers 63% of the way in one time constant', () => {
    const mass = new ThermalMass(100, 0.1, 25); // τ = 10 s
    mass.update(1, mass.timeConstant, 25);
    expect(mass.celsius).toBeCloseTo(25 + 100 * (1 - Math.exp(-1)), 9);
  });

  it("gives the same answer however time is chopped up", () => {
    const whole = new ThermalMass(340, 0.044, 25);
    whole.update(0.8, 3, 25);
    const chopped = new ThermalMass(340, 0.044, 25);
    for (let i = 0; i < 3000; i++) chopped.update(0.8, 0.001, 25);
    expect(chopped.celsius).toBeCloseTo(whole.celsius, 9);
  });

  it('cools back toward the air', () => {
    const mass = new ThermalMass(100, 0.1, 25);
    mass.update(1, 1000, 25);
    mass.update(0, 1000, 25);
    expect(mass.celsius).toBeCloseTo(25, 9);
  });

  it('refuses impossible materials', () => {
    expect(() => new ThermalMass(0, 1)).toThrow(RangeError);
    expect(() => new ThermalMass(1, -1)).toThrow(RangeError);
  });
});
