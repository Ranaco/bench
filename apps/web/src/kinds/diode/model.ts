import type { DiodeModel } from '@bench/engine';
import { defineKind } from '../kind';

export const diode = defineKind<DiodeModel>({
  kind: 'diode',
  name: 'Diode',
  blurb: 'Lets current through one way only, anode to cathode: your LED without the light',
  pins: [
    { id: 'anode', x: 0, y: -60, name: 'anode (+)' },
    { id: 'cathode', x: 0, y: 60, name: 'cathode (−), the band' },
  ],
  box: { x: -18, y: -60, width: 36, height: 120 },
  defaults: {},
  modules: ['diode'],
  create: (label, nodes, _props, code) => new code.diode(label, nodes.anode, nodes.cathode),
  // Its rating is an average; the brief kick a motor sends through it is far under it.
  read: ({ part, amps }) => ({ over: Math.abs(amps ?? 0) > part.spec.ratedAmps }),
});
