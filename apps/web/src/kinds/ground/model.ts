import { Ground } from '@bench/engine';
import { defineKind } from '../kind';

export const ground = defineKind<Ground>({
  kind: 'ground',
  name: 'Ground',
  blurb: 'The 0 V point voltages are measured from',
  pins: [{ id: 'pin', x: 0, y: -40, name: 'ground' }],
  box: { x: -20, y: -40, width: 40, height: 56 },
  defaults: {},
  // Wiring, not a part with code of its own.
  modules: [],
  create: (label, nodes) => new Ground(label, nodes.pin),
  grounds: true,
});
