/**
 * Your program: what the ESP32 runs. Bench runs setup() once when the board starts, then loop() over and over, as
 * an Arduino does.
 *
 * Everything you need comes from '../program/arduino'. Add what you use to an import line at the top, like:
 *
 *   import { delay, digitalWrite, HIGH, LOW, OUTPUT, pinMode } from '../program/arduino';
 *
 *   pinMode(pin, mode)        mode: INPUT, OUTPUT, INPUT_PULLUP or INPUT_PULLDOWN
 *   digitalWrite(pin, level)  level: HIGH (3.3 V) or LOW (0 V), on an OUTPUT pin
 *   digitalRead(pin)          HIGH or LOW
 *   analogRead(pin)           0 to 4095, for the voltage on GPIO 2, 4, 32, 33 or 34
 *   millis()                  milliseconds since the board started
 *   await delay(ms)           wait, while the rest of the circuit carries on
 *   Serial.println(value)     print a line in the Serial Monitor
 *
 * Pins are numbered as on the board: GPIO4 is pin 4. On a real board delay() just stops the program; here it's
 * `await delay(500)`, and a function that uses it is `async`: `export async function loop() { … }`.
 *
 * Save, and the page reloads with your program running on the board.
 */

export function setup(): void {
  // Runs once, when the board starts.
}

export function loop(): void {
  // Runs over and over.
}
