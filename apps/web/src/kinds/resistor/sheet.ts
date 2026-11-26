import { QUARTER_WATT } from '@bench/engine';
import { field, type SpecSheet } from '../sheet';

const RESISTOR_SHEET: SpecSheet = {
  maker: 'Any maker',
  model: '¼ W carbon film',
  description: 'The resistor in every starter kit',
  document: 'Typical ratings for the type, not one datasheet',
  sections: [
    {
      title: 'Rating',
      fields: [
        field('Heat it can take, continuously', QUARTER_WATT.ratedWatts, 'W', 1, 'typical', 'Rated up to 70 °C; less above that.', 'P'),
        field('Hottest it’s meant to run', QUARTER_WATT.maxCelsius, '°C', 1, 'typical', 'Its rating falls to nothing here.'),
      ],
    },
    {
      title: 'Heat',
      fields: [
        field('Degrees hotter per watt', QUARTER_WATT.kelvinPerWatt, 'K/W', 1, 'worked-out', '(155 − 70) ÷ 0.25: its rating falls to nothing over those 85 degrees.', 'Rth'),
        field('Energy to warm it one degree', QUARTER_WATT.joulesPerKelvin, 'mJ/K', 1e-3, 'estimate', 'Sets how fast it heats up, not how hot it gets.'),
        field('Where it burns out', QUARTER_WATT.burnCelsius, '°C', 1, 'estimate', 'Where the coating chars and the film breaks, so it fails open.'),
      ],
    },
  ],
};

export { RESISTOR_SHEET };
