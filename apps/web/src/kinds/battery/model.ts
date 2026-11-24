import type { BatteryModel } from '@bench/engine';
import { SUPPLIES } from '../../kit';
import { defineKind } from '../kind';

/** The supply a battery's saved setting names: the 9 V one when it names none on offer. */
export function supplyFor(id: string | number | undefined) {
  return SUPPLIES.find((s) => s.id === id) ?? SUPPLIES[SUPPLIES.length - 1];
}

/**
 * Below this, a battery counts as unplugged. Far less than anything connected to one draws here: the smallest
 * leak in the kit, the 220 µF capacitor's, takes 20 µA from a 9 V battery.
 */
const IDLE_AMPS = 1e-6;

export const battery = defineKind<BatteryModel>({
  kind: 'battery',
  name: 'Battery',
  blurb: 'Pushes current out of its plus terminal',
  pins: [
    { id: 'plus', x: 0, y: -60, name: 'plus' },
    { id: 'minus', x: 0, y: 60, name: 'minus' },
  ],
  box: { x: -28, y: -60, width: 66, height: 120 }, // to the right of the + sign
  defaults: { supply: '9v' },
  modules: ['battery'],
  create: (label, nodes, props, code) => {
    const supply = supplyFor(props.supply);
    return new code.battery(label, nodes.plus, nodes.minus, supply.volts, supply.ohms);
  },
  supplies: ({ amps, failed }) => !failed && Math.abs(amps ?? 0) >= IDLE_AMPS,
});
