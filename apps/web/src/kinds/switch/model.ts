import type { SlideSwitchModel } from '@bench/engine';
import { defineKind } from '../kind';

export const slideSwitch = defineKind<SlideSwitchModel>({
  kind: 'switch',
  name: 'Slide switch',
  tile: 'Switch',
  blurb: 'Connects its middle pin, common, to side A or side B',
  pins: [
    { id: 'common', x: -60, y: 0, name: 'common' },
    { id: 'a', x: 60, y: -20, name: 'side A' },
    { id: 'b', x: 60, y: 20, name: 'side B' },
  ],
  box: { x: -60, y: -30, width: 120, height: 60 },
  // Which side common is slid to: 'a' or 'b'.
  defaults: { side: 'a' },
  modules: ['slide-switch', 'switch'],
  create: (label, nodes, props, code) =>
    new code['slide-switch'](label, nodes.common, nodes.a, nodes.b, props.side === 'b' ? 'b' : 'a', undefined, code.switch),
  read: ({ part, amps }) => ({ over: Math.abs(amps ?? 0) > part.spec.ratedAmps }),
});
