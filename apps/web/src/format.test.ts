import { describe, expect, it } from 'vitest';
import { formatSI } from './format';

describe('formatSI', () => {
  it('picks a prefix and keeps three figures', () => {
    expect(formatSI(0.0213, 'A')).toBe('21.3 mA');
    expect(formatSI(2.0137, 'V')).toBe('2.01 V');
    expect(formatSI(0.0000042, 'A')).toBe('4.20 µA');
  });

  it('trims for labels', () => {
    expect(formatSI(4700, 'Ω', { trim: true })).toBe('4.7 kΩ');
    expect(formatSI(330, 'Ω', { trim: true })).toBe('330 Ω');
  });

  it('rolls over to the next prefix instead of printing 1000', () => {
    expect(formatSI(999.7, 'Ω')).toBe('1.00 kΩ');
  });

  it('reads tiny values as zero below the floor', () => {
    expect(formatSI(1e-15, 'A', { floor: 1e-9 })).toBe('0 A');
    expect(formatSI(0, 'V')).toBe('0 V');
  });

  it('keeps the sign', () => {
    expect(formatSI(-1.5, 'V')).toBe('-1.50 V');
  });

  it('shows a dash for nonsense', () => {
    expect(formatSI(Number.NaN, 'V')).toBe('—');
  });
});
