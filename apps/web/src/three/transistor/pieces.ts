import type { PieceInfo } from '../core/model';

/** The transistor's pieces: the case, the legs, what's inside, and the chip's layers, sketched beside it. */
export const Q_PIECES = [
  'body',
  'emitterLeg',
  'baseLeg',
  'collectorLeg',
  'chip',
  'emitterWire',
  'baseWire',
  'emitterLayer',
  'baseLayer',
  'collectorLayer',
] as const;

export type QPiece = (typeof Q_PIECES)[number];

const CASE = 'onsemi’s TO-92 drawing, case 135AN (98AON13880G), the middle of each range it prints.';
const INSIDE = 'Inside, so on no datasheet: drawn as an illustration.';
const WIKI = 'Wikipedia, “Bipolar junction transistor”';
const SKETCH = 'A sketch of the order of the layers, magnified and not to scale.';

export const Q_INFO: Readonly<Record<QPiece, PieceInfo>> = {
  body: {
    name: 'The body',
    does: 'Plastic moulded round the chip and the tops of the legs, sealing them in. The flat face is the front: looking at it, the legs are emitter, base, collector, from the left. Printed with its top mark, PN2222A.',
    source: `Size and shape: ${CASE} The top mark is from Fairchild’s PN2222A sheet; real ones carry more print, like a date code, not drawn here. Its colour is a stand-in.`,
  },
  emitterLeg: {
    name: 'Emitter (E), leg 1',
    does: 'Where the current leaves: the base’s small current and the collector’s big one, together. On the symbol, it’s the leg with the arrow.',
    source: `Size: ${CASE} Leg 1 is the emitter (KSP2222A datasheet, page 1). How far it reaches up inside the body is drawn.`,
  },
  baseLeg: {
    name: 'Base (B), leg 2',
    does: 'The control. A small current in here sets the big one from collector to emitter.',
    source: `Size: ${CASE} Leg 2 is the base. How far it reaches up inside is drawn.`,
  },
  collectorLeg: {
    name: 'Collector (C), leg 3',
    does: 'Where the big current comes in. Inside the body it widens into a flag, and the chip sits on it.',
    source: `Size: ${CASE} Leg 3 is the collector. The flag is drawn: the PN2222A’s own lead frame isn’t published. It’s drawn on the collector because a transistor chip’s bottom layer is its collector (${WIKI}: a 2N2222’s die is “made in layers with the collector at the bottom”).`,
  },
  chip: {
    name: 'The chip (die)',
    does: 'The transistor itself: a sliver of silicon in three layers, N, P, N. Everything else is there to hold it and wire it up. Show its layers to see them.',
    source: `${INSIDE} Its size isn’t published. Silicon’s colour is measured (physicallybased.info).`,
  },
  emitterWire: {
    name: 'Bond wire to the emitter',
    does: 'A hair-thin wire from the top of the chip, where the emitter layer is, to the emitter leg.',
    source: `${INSIDE} Neither its metal nor its thickness is published: it’s drawn gold-coloured, and thick enough to see.`,
  },
  baseWire: {
    name: 'Bond wire to the base',
    does: 'The same, from the base layer on top of the chip to the base leg. The collector needs no wire: it’s the bottom of the chip, sitting on its leg.',
    source: `${INSIDE} Drawn like the emitter’s.`,
  },
  emitterLayer: {
    name: 'Emitter (N)',
    does: 'Silicon given plenty of spare electrons. With the base switched on, it pours them into the base.',
    source: `${SKETCH} “The emitter is heavily doped, while the collector is lightly doped” (${WIKI}).`,
  },
  baseLayer: {
    name: 'Base (P), thin',
    does: 'Silicon short of electrons, and very thin. It’s so thin that the electrons from the emitter shoot straight across into the collector: only about 1 in 256 leaves by the base wire. That’s where the gain comes from.',
    source: `${SKETCH} “The thickness of the base must be much less than the diffusion length of the carriers” (${WIKI}). The 1 in 256 is the maker’s gain, 255.9.`,
  },
  collectorLayer: {
    name: 'Collector (N)',
    does: 'The bottom of the chip, gathering the electrons that cross the base. Lightly treated, so it can stand a bigger voltage.',
    source: `${SKETCH} The collector is at the bottom, and “the collector–base junction has a much larger area than the emitter–base junction” (${WIKI}).`,
  },
};
