import { Junction } from '@bench/engine';
import { defineKind } from '../kind';

export const junction = defineKind<Junction>({
  kind: 'junction',
  name: 'Junction',
  blurb: 'Where wires join: one point, one voltage',
  pins: [{ id: 'pin', x: 0, y: 0, name: 'junction' }],
  box: { x: -8, y: -8, width: 16, height: 16 },
  // Which way the wire it cut runs through it: 'h' (across) or 'v' (up and down), before any turning.
  defaults: { axis: 'h' },
  // Wiring, not a part with code of its own.
  modules: [],
  create: (label, nodes) => new Junction(label, nodes.pin),
});
