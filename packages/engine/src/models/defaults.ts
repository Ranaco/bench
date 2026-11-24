/**
 * Bench's own code for every part: what a part runs once the lesson that introduces it is finished, and what the
 * engine's tests check the circuit and the board against.
 */
import { Battery } from '../parts/battery';
import { Electrolytic } from '../parts/electrolytic';
import { Esp32 } from '../parts/esp32';
import { Resistor } from '../parts/resistor';
import { SlideSwitch } from '../parts/slide-switch';
import { Capacitor } from './capacitor/default';
import type { Code } from './contracts';
import { Gpio } from './gpio/default';
import { Led } from './led/default';
import { Potentiometer } from './potentiometer/default';
import { Switch } from './switch/default';
import { Transistor } from './transistor/default';

export const DEFAULTS: Code = {
  battery: Battery,
  resistor: Resistor,
  led: Led,
  switch: Switch,
  'slide-switch': SlideSwitch,
  potentiometer: Potentiometer,
  capacitor: Capacitor,
  electrolytic: Electrolytic,
  transistor: Transistor,
  gpio: Gpio,
  esp32: Esp32,
};
