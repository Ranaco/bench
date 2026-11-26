import { KNOB_10K } from '@bench/engine';
import { field, type SpecSheet } from '../sheet';

const KNOB_SHEET: SpecSheet = {
  maker: 'Bourns',
  model: 'PTV09',
  description: '9 mm carbon potentiometer, 10 kΩ, linear taper',
  document: 'PTV09 datasheet, REV. 01/25',
  sections: [
    {
      title: 'Track',
      fields: [
        field('Resistance, end to end', KNOB_10K.totalOhms, 'kΩ', 1e3, 'datasheet', '±20 %: Bench uses the nominal value.'),
        field('Left at each end', KNOB_10K.residualOhms, 'Ω', 1, 'datasheet', 'Printed as “500 ohms or ±1 % max.”: Bench uses 500 Ω, the most it allows. A real one may leave much less.'),
        field('Dead zone at each end', KNOB_10K.deadZone, '%', 0.01, 'datasheet', 'Its linear taper (B0) rises in a straight line from 5 % to 95 % of the turn; outside that the wiper rests on the end.'),
        field('How far it turns', KNOB_10K.turnDegrees, '°', 1, 'datasheet', 'Mechanical angle, ±10°.'),
      ],
    },
    {
      title: 'Rating',
      fields: [
        field('Heat the whole track can take', KNOB_10K.ratedWatts, 'W', 1, 'datasheet', 'Up to 50 °C around it. Past it, Bench warns: the datasheet has no heat data to burn it by.', 'P'),
        field('Most voltage across it', KNOB_10K.ratedVolts, 'V', 1, 'datasheet', 'DC.'),
      ],
    },
  ],
};

export { KNOB_SHEET };
