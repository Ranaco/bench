/**
 * How bright an LED is drawn: as an eye sees it, whatever the screen's frame rate. PWM faster than an eye can follow
 * looks steady at its average; a slow blink still goes all the way on and off; a plain LED doesn't fade in.
 */
import { describe, expect, it } from 'vitest';
import { ledLoop, partOf, pwmBoard } from '../builder/fixtures';
import { BoardSim } from '.';

/** The LED's glow, frame by frame, at frames `frameMs` apart, once it's settled. */
async function glowOver(onMs: number, offMs: number, frameMs: number): Promise<number[]> {
  const { sim, led } = pwmBoard(onMs, offMs);
  const glows: number[] = [];
  for (let t = 0; t < 1.5; t += frameMs / 1000) {
    await sim.advance(frameMs / 1000);
    if (t > 0.5) glows.push(partOf(sim, led).glowAmps ?? 0);
  }
  return glows;
}

describe('An LED’s glow, as an eye sees it', () => {
  it('is steady under 100 Hz PWM at every frame rate, at the same brightness', async () => {
    const means: number[] = [];
    for (const frameMs of [5.5, 7, 1000 / 60]) {
      const glows = await glowOver(5, 5, frameMs);
      const mean = glows.reduce((a, b) => a + b, 0) / glows.length;
      // A few percent of its average at most. Averaged over one screen frame instead, it jumped from frame to frame:
      // the glow's opacity went between 0.49 and 0.74, at frames 5.5 ms apart.
      expect(Math.max(...glows) - Math.min(...glows), `frames ${String(frameMs)} ms apart`).toBeLessThan(mean * 0.08);
      means.push(mean);
    }
    for (const mean of means) expect(mean).toBeCloseTo(means[0] ?? 0, 4);
  });

  it('still blinks all the way on and off at 5 Hz', async () => {
    const glows = await glowOver(100, 100, 1000 / 60);
    expect(Math.min(...glows)).toBeLessThan(1e-4);
    // Fully on: what it carries lit steadily, with the pin held high.
    const { sim, led } = pwmBoard(1000, 0);
    await sim.advance(0.3);
    expect(Math.max(...glows)).toBeGreaterThan(0.99 * (partOf(sim, led).glowAmps ?? 0));
  });

  it('doesn’t fade in: a plain LED glows at its current from the first frame', () => {
    const loop = ledLoop(470);
    const sim = new BoardSim();
    sim.sync(loop.board);
    sim.step(1 / 60);
    const reading = partOf(sim, loop.led);
    expect(reading.glowAmps).toBeGreaterThan(0);
    expect(reading.glowAmps).toBeCloseTo(reading.amps ?? 0, 9);
  });
});
