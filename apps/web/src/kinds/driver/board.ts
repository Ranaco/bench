/**
 * The TB6612FNG's pins on Bench's board. The chip has 24; Bench shows the ones a circuit uses, each once: its three
 * VM pins and its three ground pins are joined on its board, so they're one VM and two GNDs here. Inputs down the
 * left, from the ESP32; the motor supply and the outputs down the right, to the motors (datasheet p.2, Pin Functions).
 */
export interface DriverPin {
  readonly id: string;
  /** What the datasheet calls it. */
  readonly name: string;
  readonly x: number;
  readonly y: number;
}

export const DRIVER_PINS: readonly DriverPin[] = [
  { id: 'vcc', name: 'VCC', x: -100, y: -80 },
  { id: 'stby', name: 'STBY', x: -100, y: -60 },
  { id: 'ain1', name: 'AIN1', x: -100, y: -40 },
  { id: 'ain2', name: 'AIN2', x: -100, y: -20 },
  { id: 'pwma', name: 'PWMA', x: -100, y: 0 },
  { id: 'bin1', name: 'BIN1', x: -100, y: 20 },
  { id: 'bin2', name: 'BIN2', x: -100, y: 40 },
  { id: 'pwmb', name: 'PWMB', x: -100, y: 60 },
  { id: 'gnd', name: 'GND', x: -100, y: 80 },
  { id: 'vm', name: 'VM', x: 100, y: -80 },
  { id: 'ao1', name: 'AO1', x: 100, y: -40 },
  { id: 'ao2', name: 'AO2', x: 100, y: -20 },
  { id: 'bo1', name: 'BO1', x: 100, y: 20 },
  { id: 'bo2', name: 'BO2', x: 100, y: 40 },
  { id: 'gnd2', name: 'GND', x: 100, y: 80 },
];

/** The body's half-width and half-height, inside the pins' leads: wider than tall, so its label sits above it. */
export const DRIVER_BODY = { halfX: 80, halfY: 90 };
