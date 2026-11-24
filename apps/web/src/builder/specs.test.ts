import { ENERGIZER_522, ENERGIZER_E91, ESP32_GPIO, KNOB_10K, QUARTER_WATT, RED_LED, SLIDE_SWITCH, TACT_SWITCH, UVR_25V } from '@bench/engine';
import { describe, expect, it } from 'vitest';
import { SUPPLIES } from '../kit';
import { CAPACITOR_VALUES } from '../kinds/capacitor/model';
import { sheetFor, shown, type SpecSheet } from './specs';

const values = (sheet: SpecSheet | undefined) => sheet?.sections.flatMap((s) => s.fields.map((f) => f.value)) ?? [];

describe('spec sheets', () => {
  it('show exactly the numbers the circuit runs on', () => {
    expect(values(sheetFor('led', {})).sort()).toEqual(Object.values(RED_LED).sort());
    expect(values(sheetFor('resistor', {})).sort()).toEqual(Object.values(QUARTER_WATT).sort());
    expect(values(sheetFor('switch', {})).sort()).toEqual(Object.values(SLIDE_SWITCH).sort());
    expect(values(sheetFor('button', {})).sort()).toEqual(Object.values(TACT_SWITCH).sort());
    expect(values(sheetFor('knob', {})).sort()).toEqual(Object.values(KNOB_10K).sort());
    expect(values(sheetFor('esp32', {})).sort()).toEqual(Object.values(ESP32_GPIO).sort());
    for (const uf of CAPACITOR_VALUES) {
      expect(values(sheetFor('capacitor', { uf })).sort()).toEqual(Object.values(UVR_25V[uf]).sort());
    }
    expect(values(sheetFor('battery', { supply: '9v' }))).toEqual([ENERGIZER_522.volts, ENERGIZER_522.ohms]);
    expect(values(sheetFor('battery', { supply: 'aa' }))).toEqual([2 * ENERGIZER_E91.volts, 2 * ENERGIZER_E91.ohms]);
  });

  it('have one sheet for every supply in the kit', () => {
    const models = SUPPLIES.map((s) => sheetFor('battery', { supply: s.id })?.model);
    expect(new Set(models).size).toBe(SUPPLIES.length);
  });

  it('have no sheet for ground or junctions', () => {
    expect(sheetFor('ground', {})).toBeUndefined();
    expect(sheetFor('junction', {})).toBeUndefined();
  });

  it('show values in each field’s own unit', () => {
    const maxAmps = sheetFor('led', {})?.sections[0].fields.find((f) => f.symbol === 'IF max');
    if (!maxAmps) throw new Error('no IF max');
    expect(shown(maxAmps)).toBe('30');
    const open = sheetFor('button', {})?.sections[0].fields[1];
    if (!open) throw new Error('no open resistance');
    expect(`${shown(open)} ${open.unit}`).toBe('100 MΩ');
  });
});
