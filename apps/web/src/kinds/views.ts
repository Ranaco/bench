/** How every kind of part looks and reads, by its kind (see view.ts). */
import type { PartKind } from '../builder/board';
import { batteryView } from './battery/view';
import { buttonView } from './button/view';
import { capacitorView } from './capacitor/view';
import { esp32View } from './esp32/view';
import { knobView } from './knob/view';
import { ledView } from './led/view';
import { resistorView } from './resistor/view';
import { switchView } from './switch/view';
import { transistorView } from './transistor/view';
import { GroundSymbol, JunctionSymbol } from './simple-symbols';
import { amps, type KindView } from './view';

/** Wiring: its symbol says it all. */
const WIRING = { label: () => [] };

export const VIEWS: Readonly<Record<PartKind, KindView>> = {
  battery: batteryView,
  resistor: resistorView,
  led: ledView,
  switch: switchView,
  button: buttonView,
  knob: knobView,
  capacitor: capacitorView,
  transistor: transistorView,
  esp32: esp32View,
  ground: { ...WIRING, Symbol: GroundSymbol, rows: (_part, reading) => [['Current into ground', amps(reading.amps)]] },
  junction: { ...WIRING, Symbol: JunctionSymbol },
};
