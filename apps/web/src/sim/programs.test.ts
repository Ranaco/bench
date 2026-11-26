/**
 * Saving a program puts it on the board's ESP32 the way an upload does on a real one: the chip resets, so every pin
 * starts again as an input, whatever the program before left it doing.
 */
import { loadProgram, ProgramRunner } from '@bench/engine';
import { describe, expect, it } from 'vitest';
import { EMPTY_BOARD } from '../builder/board';
import { place } from '../builder/fixtures';
import { BoardSim } from '.';

/** Drives GPIO21 HIGH once, then does nothing. */
const DRIVES_21 = `import { digitalWrite, HIGH, OUTPUT, pinMode } from 'bench/arduino';
export function setup(): void { pinMode(21, OUTPUT); digitalWrite(21, HIGH); }
export function loop(): void {}`;

/** Never touches a pin. */
const IDLE = 'export function loop(): void {}';

describe('A program saved onto a running board', () => {
  it('starts from a reset: a pin the last program drove HIGH is an input again', async () => {
    const chip = place(EMPTY_BOARD, 'esp32');
    let text = DRIVES_21;
    const sim = new BoardSim((_chip, _id, source) => new ProgramRunner(loadProgram(source)), undefined, (id) => ({ text, file: `${id}.ts` }));
    const pin21 = () => sim.getSnapshot().parts[chip.id]?.chip?.pins.gpio21;
    sim.sync(chip.board);
    await sim.advance(0.1);
    expect(pin21()).toMatchObject({ mode: 'output', high: true });

    text = IDLE;
    sim.setPrograms((id) => ({ text, file: `${id}.ts` }));
    await sim.advance(0.1);
    expect(pin21()).toMatchObject({ mode: 'input', high: false });
  });
});
