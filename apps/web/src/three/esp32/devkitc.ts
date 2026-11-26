import { drawn, printed, scaled, type Size } from '../core/units';

/**
 * The ESP32-DevKitC V4 in 3D, with the ESP32-WROOM-32E module (the common ESP32-DevKitC-32E).
 *
 * Its outline and pins are from Espressif's "ESP32-DevKitC V4 Dimensions" drawing (esp32_devkitc_v4_dimensions.pdf,
 * unit mm); the module from the ESP32-WROOM-32E datasheet v2.1, Figure 10; the chip inside from the ESP32 datasheet
 * v5.3 ("QFN 5*5"). The other chips are named on the board's schematic (esp32_devkitc_v4_sch.pdf): an AMS1117-3.3
 * regulator and a CP2102N USB bridge; their sizes, the USB socket's and the buttons' are scaled off the dimension
 * drawing. Nothing gives heights for those, or for the board, the headers or their pins: those are drawn.
 *
 * Built lying flat with its long side along x: the header row with 3V3 at the front (+z), pin 1 (3V3) at x = 0, the
 * antenna end towards −x, the USB socket towards +x, the back row 25.40 mm behind. y = 0 is the bottom of the headers,
 * where it sits on a breadboard; the pins go down into it (docs/3d.md §2).
 */
export const BOARD = {
  long: printed(48.26, 'the board, long'),
  wide: printed(27.94, 'the board, across'),
  rows: printed(25.4, 'between the two rows of pins'),
  pitch: printed(2.54, 'from one pin to the next'),
  sideMargin: printed(1.3, 'from the back row to the board’s edge'),
  endMargin: printed(1.29, 'from the last pin to the USB end'),
  overhang: printed(6.04, 'how far the module’s antenna reaches past the board'),
  thick: drawn(1.6, 'the board, thick'),
} as const satisfies Record<string, Size>;

/** The two margins the drawing doesn't print, worked out from those it does. */
export const MARGINS = {
  front: scaled(BOARD.wide.mm - BOARD.rows.mm - BOARD.sideMargin.mm, 'from the front row to the board’s edge'),
  antennaEnd: scaled(BOARD.long.mm - 18 * BOARD.pitch.mm - BOARD.endMargin.mm, 'from pin 1 to the antenna end'),
} as const satisfies Record<string, Size>;

export const MODULE = {
  wide: printed(18, 'the module, across'),
  long: printed(25.5, 'the module, long'),
  tall: printed(3.1, 'the module, tall, shield and all'),
  pcb: printed(0.8, 'the module’s own board, thick'),
  canWide: printed(15.8, 'its shield can, across'),
  canLong: printed(17.6, 'its shield can, long'),
  canFromEnd: printed(1.05, 'from the can to the module’s end'),
  antenna: printed(6.19, 'its antenna, at the far end'),
} as const satisfies Record<string, Size>;

export const INSIDE = {
  chip: printed(5, 'the ESP32 chip, square (QFN 5×5)'),
  chipTall: drawn(0.9, 'the chip, thick'),
  flashWide: drawn(5, 'the flash memory chip, across'),
  flashLong: drawn(6, 'the flash memory chip, long'),
  flashTall: drawn(0.8, 'the flash chip, thick'),
} as const satisfies Record<string, Size>;

/** The parts on the board, scaled off the dimension drawing (16.08 px to the mm); their heights are drawn. */
export const PARTS = {
  usbWide: scaled(8, 'the USB socket, across'),
  usbDeep: scaled(5.6, 'the USB socket, deep'),
  usbPast: scaled(1, 'how far it reaches past the board'),
  usbTall: drawn(2.8, 'the USB socket, tall'),
  bridge: scaled(5, 'the USB bridge chip, square'),
  bridgeTall: drawn(0.9, 'the USB bridge, thick'),
  regulatorLong: scaled(6.5, 'the regulator, long'),
  regulatorWide: scaled(3.6, 'the regulator, across'),
  regulatorTall: drawn(1.6, 'the regulator, thick'),
  buttonLong: scaled(6.2, 'each button, long'),
  buttonWide: scaled(3.4, 'each button, across'),
  buttonTall: drawn(2, 'each button, tall'),
} as const satisfies Record<string, Size>;

/**
 * Where those parts sit, scaled off the dimension drawing: x along the board from pin 1, z across it from the front
 * row (the back row is at −25.40). The chip and flash under the can aren't on any drawing: drawn.
 */
export const PLACES = {
  bridgeX: scaled(35, 'the USB bridge’s centre, along the board'),
  regulatorX: scaled(27.55, 'the regulator’s centre, along the board'),
  buttonsX: scaled(43.25, 'the buttons’ centres, along the board'),
  enZ: scaled(-4.98, 'the EN button’s centre, across'),
  bootZ: scaled(-20.84, 'the Boot button’s centre, across'),
  chipIn: drawn(6, 'the chip’s centre, in from the can’s near end'),
  flashIn: drawn(13, 'the flash’s centre, in from the can’s near end'),
} as const satisfies Record<string, Size>;

export const HEADER = {
  tall: drawn(2.5, 'each header’s plastic, tall'),
  pin: drawn(0.64, 'each pin, square'),
  below: drawn(6, 'how far each pin reaches below the plastic'),
  above: drawn(1.2, 'how far each pin stands above the board'),
} as const satisfies Record<string, Size>;

/** What the board's silkscreen calls each pin, front row then back row, as on the dimension drawing. */
export const FRONT_ROW = ['3V3', 'EN', 'VP', 'VN', '34', '35', '32', '33', '25', '26', '27', '14', '12', 'GND', '13', 'D2', 'D3', 'CMD', '5V'];
export const BACK_ROW = ['GND', '23', '22', 'TX', 'RX', '21', 'GND', '19', '18', '5', '17', '16', '4', '0', '2', '15', 'D1', 'D0', 'CLK'];

/** Bench's board pins, by id, as places on the real headers: which row, and how far along it. */
export const BOARD_PINS: Readonly<Record<string, { readonly row: 'front' | 'back'; readonly index: number }>> = {
  v3: { row: 'front', index: 0 },
  gpio34: { row: 'front', index: 4 },
  gpio32: { row: 'front', index: 6 },
  gpio33: { row: 'front', index: 7 },
  gnd: { row: 'front', index: 13 },
  gnd2: { row: 'back', index: 0 },
  gpio21: { row: 'back', index: 5 },
  gpio19: { row: 'back', index: 7 },
  gpio18: { row: 'back', index: 8 },
  gpio5: { row: 'back', index: 9 },
  gpio4: { row: 'back', index: 12 },
  gpio2: { row: 'back', index: 14 },
};
