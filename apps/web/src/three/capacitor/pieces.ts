import type { PieceInfo } from '../core/model';

/** The capacitor's pieces, from the outside in, then the leads. */
export const CAP_PIECES = [
  'sleeve',
  'can',
  'vent',
  'roll',
  'anode',
  'paper',
  'cathode',
  'plusTab',
  'minusTab',
  'seal',
  'plusLead',
  'minusLead',
] as const;

export type CapPiece = (typeof CAP_PIECES)[number];

const INSIDE = 'Inside, so not on the datasheet: drawn from Nichicon’s technical notes (CAT.8101H) as an illustration.';

export const CAP_INFO: Readonly<Record<CapPiece, PieceInfo>> = {
  sleeve: {
    name: 'Sleeve',
    does: 'A plastic (PET) skin shrunk round the can, printed with its value and voltage. It stops things touching the can, but it isn’t rated as insulation. The stripe of − signs marks the minus lead.',
    source: 'PET, black with white print: on the datasheet. “Protection against contact only”: TDK’s general technical information. Its thickness, and the stripe’s look, are drawn: the datasheet doesn’t show them.',
  },
  can: {
    name: 'Aluminium can',
    does: 'Holds the roll and its electrolyte, sealed at the bottom by the rubber. The groove pressed round it near the base squeezes the seal tight.',
    source: 'Its size is the datasheet’s φD × L for this part. The groove is drawn the way KiCad’s model generator draws it.',
  },
  vent: {
    name: 'Pressure relief vent',
    does: 'Lines scored into the top, so if the capacitor is abused (charged backwards, or past its voltage) and gas builds up inside, the top splits open safely instead of the can bursting.',
    source: 'The datasheet’s drawing shows a pressure relief vent. The shape of the score lines is drawn: neither the datasheet nor the technical notes give it.',
  },
  roll: {
    name: 'The roll',
    does: 'Two long strips of aluminium foil with paper between them, rolled up tight. Rolling is how so much plate fits in a small can. Unroll it to see the layers.',
    source: INSIDE,
  },
  anode: {
    name: 'Anode foil (+)',
    does: 'One plate. Its surface is etched rough, 30 to 100 times the area of flat foil, then grown a layer of oxide that doesn’t conduct: that oxide is the insulator between the plates, and it only insulates one way round, which is why it has a + and a −.',
    source: 'Etching and oxide from Nichicon’s technical notes (CAT.8101H): the oxide is about 1.3 to 1.5 nm thick per volt it’s formed for, far too thin to draw. ' + INSIDE,
  },
  paper: {
    name: 'Paper and electrolyte',
    does: 'Paper soaked in a conducting liquid, the electrolyte. The liquid fills every pit in the etched anode, so it’s the true second plate, pressed right up against the oxide; the paper just keeps the foils apart.',
    source: INSIDE,
  },
  cathode: {
    name: 'Cathode foil (−)',
    does: 'The other foil. It connects the electrolyte, the real minus plate, to the minus lead.',
    source: 'Nichicon calls the electrolyte the “real cathode” and this foil the “apparent cathode” (CAT.8101H). ' + INSIDE,
  },
  plusTab: {
    name: 'Tab (+)',
    does: 'A strip of aluminium stitched to the anode foil, through the seal to the + lead.',
    source: INSIDE + ' How the tab joins the lead isn’t given in any of them.',
  },
  minusTab: {
    name: 'Tab (−)',
    does: 'The same, from the cathode foil to the − lead.',
    source: INSIDE,
  },
  seal: {
    name: 'Rubber seal',
    does: 'Closes the bottom so the electrolyte can’t dry out or leak. The tabs pass through it to the leads.',
    source: 'A “rubber packing” in Nichicon’s notes. Its thickness is drawn.',
  },
  plusLead: {
    name: 'Lead (+)',
    does: 'The longer leg: the one that goes towards the battery’s +.',
    source: 'Its diameter, its spacing from the − lead, and its length (at least 4 mm longer than the − lead’s 15 mm) are on the datasheet. The model uses those minimums.',
  },
  minusLead: {
    name: 'Lead (−)',
    does: 'The shorter leg, on the side of the stripe: towards the battery’s −.',
    source: 'Diameter, spacing and length (at least 15 mm) from the datasheet.',
  },
};
