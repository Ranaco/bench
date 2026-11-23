/** The knob's pieces, in the order they're listed: from what you touch, inwards, then the body and its pins. */
export const PIECE_IDS = [
  'shaft',
  'collar',
  'cover',
  'rotor',
  'wiper',
  'track',
  'end1',
  'end3',
  'ring',
  'board',
  'housing',
  'pin1',
  'pin2',
  'pin3',
] as const;

export type PieceId = (typeof PIECE_IDS)[number];

export interface PieceInfo {
  readonly name: string;
  /** What it does, in plain words. */
  readonly does: string;
  /** Where its shape and size come from. */
  readonly source: string;
}

const INSIDE = 'Inside, so not on the datasheet: its shape and size are an illustration of how carbon knobs like this are built.';

export const PIECES: Readonly<Record<PieceId, PieceInfo>> = {
  shaft: {
    name: 'Shaft',
    does: 'What you turn. It’s plastic (the datasheet calls it an insulated shaft), so touching it can’t connect you to the circuit. The flat gives a knob cap something to grip. Its bottom end turns the rotor, and the rotor carries the wiper round.',
    source: '6.0 mm across, its tip 15 mm above the back of the body, with a 6 mm flat that leaves 4.5 mm: printed on the drawing.',
  },
  collar: {
    name: 'Collar',
    does: 'The raised ring at the front that the shaft comes out of.',
    source: '1.1 mm deep: printed on the drawing. How wide it is was scaled off it; the drawing doesn’t show what it’s like inside.',
  },
  cover: {
    name: 'Metal cover',
    does: 'Closes the body and holds everything inside together. Its two ears run down the sides and on into the circuit board, so the knob stays put when you turn it.',
    source: '10.0 mm wide, 11.4 mm across the ears, their legs 2.0 mm wide and reaching 3.8 mm below the body, and 6.8 mm from the back of the body to here: printed on the drawing. Its thickness and the rivets were scaled off it.',
  },
  rotor: {
    name: 'Rotor',
    does: 'A plastic disc on the end of the shaft. The wiper is fixed underneath it, so turning the shaft sweeps the wiper round the track.',
    source: INSIDE,
  },
  wiper: {
    name: 'Wiper',
    does: 'A springy metal contact with two fingers. The outer one presses on the carbon track, the inner one on the silver ring, and that ring is joined to pin 2. So pin 2 reaches the track exactly where the wiper touches it.',
    source: INSIDE,
  },
  track: {
    name: 'Carbon track',
    does: 'The resistor itself: a horseshoe of carbon. The wiper splits it in two, pin 1 to the wiper and the wiper to pin 3. Turn the shaft and one piece grows as the other shrinks; together they’re always 10 kΩ.',
    source: 'Its 10 kΩ, the 280° turn and the straight line from 5 % to 95 % of the turn are from the datasheet. Its shape and size are an illustration: it’s inside.',
  },
  end1: {
    name: 'Silver end, pin 1',
    does: 'Where the carbon ends and pin 1 joins on. For the first 5 % of the turn the wiper sits here, so turning changes nothing: that’s the dead zone in legs(). Even here the datasheet allows up to 500 Ω to be left (its residual resistance).',
    source: 'The 5 % and the 500 Ω are from the datasheet. ' + INSIDE,
  },
  end3: {
    name: 'Silver end, pin 3',
    does: 'Where the carbon ends at the other side and pin 3 joins on. For the last 5 % of the turn the wiper sits here, the second dead zone.',
    source: 'The 5 % is from the datasheet. ' + INSIDE,
  },
  ring: {
    name: 'Silver ring, pin 2',
    does: 'A ring of silver joined to pin 2. The wiper’s inner finger rides on it all the way round, so pin 2 is always connected to the wiper, wherever it is.',
    source: INSIDE,
  },
  board: {
    name: 'Track board',
    does: 'The flat board the carbon and the silver are printed on.',
    source: INSIDE,
  },
  housing: {
    name: 'Body',
    does: 'The plastic body that holds the pins, the track board and the rotor.',
    source: '10.0 mm wide, 5.5 mm from the shaft’s centre to its top, and 6.8 mm deep with the cover: printed on the drawing. Its other sizes were scaled off it.',
  },
  pin1: {
    name: 'Pin 1',
    does: 'Joined to one end of the track: the end the wiper reaches when you turn it all the way anticlockwise.',
    source: '2.5 mm apart, 7.0 mm from the shaft’s centre, and 1.5 mm wide where they leave the body: printed on the drawing. The datasheet’s board layout numbers them 1, 2, 3 from the left (pins towards you, as here) and gives each a 1.0 mm hole, so their tips are drawn thinner to fit. Its taper graph has pin 1 to pin 2 growing as the knob turns from its anticlockwise end.',
  },
  pin2: {
    name: 'Pin 2, the wiper',
    does: 'Joined to the silver ring, and through it to the wiper, wherever the wiper is on the track.',
    source: 'Placed and sized like pin 1: from the drawing and the board layout.',
  },
  pin3: {
    name: 'Pin 3',
    does: 'Joined to the other end of the track: the end the wiper reaches when you turn it all the way clockwise.',
    source: 'Placed and sized like pin 1: from the drawing and the board layout.',
  },
};

/** The pieces you can turn the knob by. */
export const TURNS_IT: ReadonlySet<PieceId> = new Set(['shaft']);
