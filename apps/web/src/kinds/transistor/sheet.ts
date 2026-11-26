import { PN2222A } from '@bench/engine';
import { field, type SpecSheet } from '../sheet';

/** The PN2222A: its limits from onsemi's current sheet, its model from the SPICE line on Fairchild's. */
const TRANSISTOR_SHEET: SpecSheet = {
  maker: 'onsemi (formerly Fairchild)',
  model: 'PN2222A',
  description: 'NPN general-purpose transistor, TO-92, legs E B C. onsemi sells it now as the KSP2222A.',
  document: 'KSP2222A Rev. 2 (onsemi, October 2023); SPICE model from PN2222A Rev. A1 (Fairchild, August 2004)',
  sections: [
    {
      title: 'Gain',
      fields: [
        field(
          'Collector current ÷ base current',
          PN2222A.forwardGain,
          '',
          1,
          'datasheet',
          'Bf, from the SPICE model printed on Fairchild’s sheet. onsemi guarantees 100 to 300 at 150 mA, and at least 35 at 0.1 mA, 50 at 1 mA, 75 at 10 mA and 40 at 500 mA (VCE = 10 V). A real one’s gain falls away at high currents; Bench’s stays put.',
          'hFE',
        ),
        field('The same, run backwards', PN2222A.reverseGain, '', 1, 'datasheet', 'Br, from the same SPICE model: collector and emitter swapped.', 'Br'),
      ],
    },
    {
      title: 'Inside',
      fields: [
        field(
          'Saturation current',
          PN2222A.saturationAmps,
          'fA',
          1e-15,
          'datasheet',
          'Is, from the SPICE model: what sets the voltage each junction turns on at, about 0.6 to 0.8 V at the currents here.',
          'Is',
        ),
        field('Base resistance', PN2222A.baseOhms, 'Ω', 1, 'datasheet', 'Rb, from the SPICE model: the base lead and silicon.', 'Rb'),
        field('Collector resistance', PN2222A.collectorOhms, 'Ω', 1, 'datasheet', 'Rc, from the SPICE model.', 'Rc'),
      ],
    },
    {
      title: 'Limits',
      fields: [
        field(
          'Collector current',
          PN2222A.maxCollectorAmps,
          'mA',
          1e-3,
          'datasheet',
          'onsemi’s KSP2222A sheet. Fairchild’s 2014 PN2222A sheet says 1.0 A; the newer, lower figure is the one Bench warns at.',
          'IC',
        ),
        field(
          'Collector to emitter, base open',
          PN2222A.maxCollectorVolts,
          'V',
          1,
          'datasheet',
          'Where it breaks down: past it, current pours from collector to emitter whatever the base says. The datasheet gives 40 V as the least, measured at 10 mA; Bench breaks down there, as sharply as a junction can. The others here are warned, not simulated.',
          'VCEO',
        ),
        field('Heat, in air at 25 °C', PN2222A.maxWatts, 'mW', 1e-3, 'datasheet', 'Less when it’s warmer: 5 mW less per °C.', 'PD'),
      ],
    },
    {
      title: 'Switched fully on (what the tests hold the model to)',
      fields: [
        field('Collector to emitter, at most', 0.3, 'V', 1, 'datasheet', 'At IC = 150 mA, IB = 15 mA. Bench’s model drops about 0.18 V there.', 'VCE(sat)'),
        field('Base to emitter, at most', 1.2, 'V', 1, 'datasheet', 'At least 0.6 V, at the same currents. Bench’s: about 0.94 V.', 'VBE(on)'),
      ],
    },
  ],
};

export { TRANSISTOR_SHEET };
