import type { PotentiometerModel } from '@bench/engine';
import { defineKind, type Props } from '../kind';

/** Where a knob's dial sits, over its track: what you drag to turn it. */
export const KNOB_DIAL = { x: 0, y: -32, r: 12 };

/** How far a knob is turned, from its saved setting: 0 all the way towards pin 1, 1 all the way towards pin 3. */
export function turnOf(props: Props): number {
  const turn = Number(props.turn);
  return Number.isFinite(turn) ? Math.min(1, Math.max(0, turn)) : 0.5;
}

export const knob = defineKind<PotentiometerModel>({
  kind: 'knob',
  name: 'Knob',
  blurb: 'A potentiometer: turning it slides its wiper along a 10 kΩ track',
  pins: [
    { id: 'a', x: -60, y: 0, name: 'pin 1' },
    { id: 'wiper', x: 0, y: 40, name: 'wiper (pin 2)' },
    { id: 'b', x: 60, y: 0, name: 'pin 3' },
  ],
  box: { x: -60, y: -52, width: 120, height: 92 }, // from the top of its dial down to the wiper's pin
  defaults: { turn: 0.5 },
  modules: ['potentiometer'],
  create: (label, nodes, props, code) => new code.potentiometer(label, nodes.a, nodes.wiper, nodes.b, turnOf(props)),
  read: ({ c, part, written, failed, watts }) => {
    // legs() is given in the lesson's stub, so it's safe to call; the circuit only has the knob in it once stamp() is.
    const legs = part.legs();
    const toWiper: readonly [number, number] = failed || !written ? [0, 0] : [c.across(part.a, part.wiper), c.across(part.wiper, part.b)];
    return {
      volts: failed || !written ? 0 : c.across(part.a, part.b),
      over: watts > part.spec.ratedWatts,
      knob: { legs, volts: toWiper, wiperAmps: toWiper[0] / legs[0] - toWiper[1] / legs[1] },
    };
  },
});
