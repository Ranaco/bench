import type { ResistorModel } from '@bench/engine';
import { RESISTOR_STOPS } from '../../kit';
import { defineKind } from '../kind';

/** The resistor values on offer: the kit's E6 values (a plain connection is a wire, not a 0 Ω resistor). */
export const RESISTOR_VALUES = RESISTOR_STOPS.filter((ohms) => ohms > 0);

export const resistor = defineKind<ResistorModel>({
  kind: 'resistor',
  name: 'Resistor',
  blurb: 'Limits how much current flows',
  pins: [
    { id: 'a', x: -60, y: 0, name: 'left' },
    { id: 'b', x: 60, y: 0, name: 'right' },
  ],
  box: { x: -60, y: -18, width: 120, height: 36 },
  defaults: { ohms: 330 },
  modules: ['resistor'],
  create: (label, nodes, props, code) => new code.resistor(label, nodes.a, nodes.b, Number(props.ohms)),
  read: ({ part }) => ({ celsius: part.temperature, burnt: part.burnt, over: !part.burnt && part.temperature > part.spec.maxCelsius }),
});
