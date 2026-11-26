import { TACT_SWITCH, type SwitchModel } from '@bench/engine';
import { defineKind } from '../kind';

export const button = defineKind<SwitchModel>({
  kind: 'button',
  name: 'Push button',
  tile: 'Button',
  blurb: 'Connects its two pins only while it’s held down',
  pins: [
    { id: 'a', x: -60, y: 0, name: 'left' },
    { id: 'b', x: 60, y: 0, name: 'right' },
  ],
  box: { x: -60, y: -36, width: 120, height: 46 }, // up to the top of its cap
  defaults: {},
  modules: ['switch'],
  create: (label, nodes, _props, code) => new code.switch(label, nodes.a, nodes.b, false, TACT_SWITCH),
  read: ({ part, amps }) => ({ over: Math.abs(amps ?? 0) > part.spec.ratedAmps, closed: part.closed }),
  press: (part, down) => {
    if (part.closed === down) return false;
    part.closed = down;
    return true;
  },
});
