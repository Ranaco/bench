/** Every kind of part a board can hold, by its kind. */
import type { PartKind } from '../builder/board';
import { battery } from './battery/model';
import { button } from './button/model';
import { capacitor } from './capacitor/model';
import { diode } from './diode/model';
import { esp32 } from './esp32/model';
import { ground } from './ground/model';
import { junction } from './junction/model';
import type { KindModel } from './kind';
import { knob } from './knob/model';
import { led } from './led/model';
import { motor } from './motor/model';
import { resistor } from './resistor/model';
import { slideSwitch } from './switch/model';
import { transistor } from './transistor/model';

export const KINDS: Readonly<Record<PartKind, KindModel>> = {
  battery,
  resistor,
  led,
  switch: slideSwitch,
  button,
  knob,
  capacitor,
  transistor,
  diode,
  motor,
  esp32,
  ground,
  junction,
};
