import { RED_LED } from '@bench/engine';
import { field, type SpecSheet } from '../sheet';

const LED_SHEET: SpecSheet = {
  maker: 'Kingbright',
  model: 'WP7113ID',
  description: '5 mm high-efficiency red LED',
  document: 'Datasheet V.14A, January 2026',
  sections: [
    {
      title: 'Electrical',
      fields: [
        field('Voltage across it', RED_LED.forwardVolts, 'V', 1, 'datasheet', 'Typical, at the test current below.', 'VF'),
        field('Test current', RED_LED.typicalAmps, 'mA', 1e-3, 'datasheet', 'The current the datasheet quotes VF at.', 'IF'),
        field('Most current, continuously', RED_LED.maxAmps, 'mA', 1e-3, 'datasheet', 'Its DC forward current rating. Past it, it heats up.', 'IF max'),
      ],
    },
    {
      title: 'Fitted to its I–V graph',
      fields: [
        field('How gently its curve bends', RED_LED.ideality, '', 1, 'fitted', 'Fitted, with the resistance below, to its forward current vs. forward voltage graph: within about 15 mV.', 'n'),
        field('Resistance inside it', RED_LED.seriesOhms, 'Ω', 1, 'fitted', 'The chip and its bond wire, in series with the diode.', 'Rs'),
      ],
    },
    {
      title: 'Heat',
      fields: [
        field('Degrees hotter per watt, junction to air', RED_LED.kelvinPerWatt, 'K/W', 1, 'datasheet', 'Printed as °C/W: a kelvin and a degree Celsius are the same step.', 'Rth JA'),
        field('Hottest the junction survives', RED_LED.maxJunctionCelsius, '°C', 1, 'datasheet', 'Past this, Bench burns it out at once; a real one dims and wears out first.', 'Tj'),
        field('Energy to warm it one degree', RED_LED.joulesPerKelvin, 'mJ/K', 1e-3, 'estimate', 'Not on the datasheet. Sets how fast it heats up, not how hot it gets.'),
      ],
    },
  ],
};

export { LED_SHEET };
