import { describe, expect, it } from 'vitest';
import { bandsFor } from './bands';
import { SUPPLIES, USB_CABLE_OHMS } from './kit';
import { judge, parseGuess } from './guess';

describe('parseGuess', () => {
  it('reads plain numbers in base units', () => {
    expect(parseGuess('2', 'V')).toBe(2);
    expect(parseGuess('0.02', 'A')).toBe(0.02);
  });

  it('reads prefixes and units', () => {
    expect(parseGuess('20 mA', 'A')).toBeCloseTo(0.02, 12);
    expect(parseGuess('20m', 'A')).toBeCloseTo(0.02, 12);
    expect(parseGuess('500 µA', 'A')).toBeCloseTo(0.0005, 12);
    expect(parseGuess('2.1V', 'V')).toBe(2.1);
    expect(parseGuess('7 volts', 'V')).toBe(7);
  });

  it('accepts a decimal comma', () => {
    expect(parseGuess('2,1', 'V')).toBe(2.1);
  });

  it('keeps milli and mega apart', () => {
    expect(parseGuess('1M', 'V')).toBe(1e6);
    expect(parseGuess('1m', 'V')).toBe(1e-3);
  });

  it('refuses nonsense', () => {
    expect(parseGuess('', 'V')).toBeUndefined();
    expect(parseGuess('about two', 'V')).toBeUndefined();
    expect(parseGuess('20 mV', 'A')).toBeUndefined();
  });
});

describe('judge', () => {
  it('calls a close guess spot on', () => {
    expect(judge(0.021, 0.0211).words).toBe('Spot on');
  });

  it('says which way a guess missed', () => {
    expect(judge(0.018, 0.02).words).toBe('Close, 10% low');
    expect(judge(0.03, 0.02).words).toBe('50% high');
  });
});

describe('bandsFor', () => {
  const names = (ohms: number) => bandsFor(ohms).map((b) => b.name);

  it('reads common kit values', () => {
    expect(names(330)).toEqual(['orange', 'orange', 'brown', 'gold']);
    expect(names(10)).toEqual(['brown', 'black', 'black', 'gold']);
    expect(names(4700)).toEqual(['yellow', 'violet', 'red', 'gold']);
    expect(names(100000)).toEqual(['brown', 'black', 'yellow', 'gold']);
  });

  it('gives a 0 Ω link one black band', () => {
    expect(names(0)).toEqual(['black']);
  });
});

describe('supplies', () => {
  it('works out the USB cable from copper: 1 m of 28 AWG, there and back, is about 0.43 Ω', () => {
    expect(USB_CABLE_OHMS).toBeCloseTo(0.434, 2);
  });

  it('takes the batteries from their datasheets', () => {
    const nineVolt = SUPPLIES.find((s) => s.id === '9v');
    expect(nineVolt).toMatchObject({ volts: 9.35, ohms: 1.75 });
    expect(SUPPLIES.find((s) => s.id === 'aa')).toMatchObject({ volts: 3, ohms: 0.45 });
  });
});
