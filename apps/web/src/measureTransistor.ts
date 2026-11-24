import { Circuit, GROUND, Supply, Transistor, type ModuleClasses } from '@bench/engine';

/** One point of the transistor's graphs: the voltage on its base, the current into it, and what that lets through. */
export interface TransistorPoint {
  readonly baseVolts: number;
  readonly baseAmps: number;
  readonly collectorAmps: number;
}

/** The collector's voltage for the measurement: the KSP2222A datasheet measures its gain (hFE) at VCE = 10 V. */
export const GAIN_TEST_VOLTS = 10;

/** The base voltages measured across, V: from barely anything to far past fully on. */
const FROM = 0.5;
const TO = 0.85;
const STEPS = 140;

/**
 * Measures your transistor the way its datasheet measures gain: the collector held at 10 V above the emitter, the base
 * stepped up, both currents read. The supplies' currents are the transistor's, so this works before current() is
 * written. Undefined while its stamp() isn't written yet, or if it throws.
 */
export function measureTransistor(transistor: ModuleClasses['transistor'] = Transistor): TransistorPoint[] | undefined {
  try {
    const c = new Circuit();
    const collector = c.node('collector');
    const base = c.node('base');
    const vce = c.add(new Supply('VCE', collector, GROUND, GAIN_TEST_VOLTS));
    const vbe = c.add(new Supply('VBE', base, GROUND, FROM));
    const q = c.add(new transistor('Q1', collector, base, GROUND));
    const points: TransistorPoint[] = [];
    for (let i = 0; i <= STEPS; i++) {
      vbe.volts = FROM + ((TO - FROM) * i) / STEPS;
      const { converged } = c.step(0);
      if (c.notWritten.some((m) => m.part === q.name && m.method === 'stamp')) return undefined;
      if (!converged) continue;
      points.push({ baseVolts: vbe.volts, baseAmps: c.currentThrough(vbe) ?? Number.NaN, collectorAmps: c.currentThrough(vce) ?? Number.NaN });
    }
    return points;
  } catch {
    return undefined; // A model with a bug shows its error elsewhere; the graph just leaves it out.
  }
}
