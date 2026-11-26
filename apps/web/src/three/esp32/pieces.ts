import type { PieceInfo } from '../core/model';

/** The DevKitC's pieces: the board and its headers, the module and what's under its can, the other chips. */
export const DK_PIECES = ['board', 'frontHeader', 'backHeader', 'module', 'can', 'chip', 'flash', 'usb', 'bridge', 'regulator', 'enButton', 'bootButton'] as const;

export type DkPiece = (typeof DK_PIECES)[number];

const DRAWING = 'Espressif’s ESP32-DevKitC V4 dimension drawing';
const MODULE = 'the ESP32-WROOM-32E datasheet (v2.1, Figure 10)';
const SCALED = `Scaled off ${DRAWING}; its height is drawn.`;

export const DK_INFO: Readonly<Record<DkPiece, PieceInfo>> = {
  board: {
    name: 'The board',
    does: 'A small circuit board that carries the ESP32 module and everything it needs: USB, power, two buttons, and a row of pins down each side, labelled, for wires and breadboards.',
    source: `Its size, ${DRAWING}. Its thickness and colour are drawn: the drawing is a top view.`,
  },
  frontHeader: {
    name: 'Pins, front row',
    does: '19 pins, 2.54 mm apart: 3V3 at one end, 5V at the other, GPIO34, 32 and 33 among them. They push into a breadboard.',
    source: `Spacing from ${DRAWING}. The plastic’s height and the pins’ length are drawn.`,
  },
  backHeader: {
    name: 'Pins, back row',
    does: '19 more, 25.4 mm behind the front row: GND, then GPIO21, 19, 18, 5, 4 and 2 among them.',
    source: `Spacing from ${DRAWING}. Heights drawn, as the front row’s.`,
  },
  module: {
    name: 'The module (ESP32-WROOM-32E)',
    does: 'A ready-made little board with the ESP32 chip, its memory and its antenna: the zigzag at the end, hanging past the board so the board doesn’t block its radio.',
    source: `Its size, ${MODULE}. The DevKitC drawing outlines the longer WROVER module that also fits; this is the common WROOM-32E, drawn from the same antenna end.`,
  },
  can: {
    name: 'Shield can',
    does: 'A metal lid over the chip and its memory, keeping radio noise in and out. Take it apart to see under it.',
    source: `Its size, ${MODULE}.`,
  },
  chip: {
    name: 'The ESP32 chip',
    does: 'The microcontroller itself: two processor cores, memory, Wi-Fi and Bluetooth radios, and the GPIO pins your program drives. Each of your pin models is one of its pads.',
    source: 'ESP32-D0WD-V3, “QFN 5*5” (ESP32 datasheet v5.3; the WROOM-32E datasheet names the chip). Its place under the can and its thickness are drawn.',
  },
  flash: {
    name: 'Flash memory',
    does: 'Where your program is kept, even with the power off. The chip reads it from here when it starts.',
    source: 'Inside the can, so on no drawing: drawn as an illustration.',
  },
  usb: {
    name: 'USB socket',
    does: 'Power from your computer’s 5 V, and the way programs are sent to the chip.',
    source: SCALED,
  },
  bridge: {
    name: 'USB bridge (CP2102N)',
    does: 'Turns USB into the simple serial line the ESP32 talks over: where Serial.println() goes on a real board.',
    source: `Named on the board’s schematic. ${SCALED}`,
  },
  regulator: {
    name: 'Regulator (AMS1117-3.3)',
    does: 'Turns USB’s 5 V into the steady 3.3 V the chip runs on, and that its 3V3 pin gives out.',
    source: `Named on the board’s schematic. ${SCALED} Bench treats it as perfect: exactly 3.3 V, whatever’s drawn.`,
  },
  enButton: {
    name: 'EN button',
    does: 'Restarts the chip: your program begins again from setup().',
    source: SCALED,
  },
  bootButton: {
    name: 'Boot button',
    does: 'Held while the chip starts, it waits for a new program over USB instead of running the old one.',
    source: SCALED,
  },
};
