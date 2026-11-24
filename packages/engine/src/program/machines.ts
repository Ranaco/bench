import { TICK, type Circuit } from '../circuit';
import type { Machine } from './machine';

/**
 * Several microcontrollers on one circuit, each running its own program: one solve per tick for them all, then each
 * program that's due runs against what its own pins read. What any of them writes takes effect from the next tick,
 * for all of them alike, so none sees another's writes early.
 */
export class Machines {
  private pending = 0;
  private readonly chips = new Set<Machine>();
  /** Counts changes to the chips, so a step partway through can tell the board has changed under it. */
  private changes = 0;

  constructor(readonly circuit: Circuit) {}

  add(machine: Machine): void {
    this.chips.add(machine);
    this.changes++;
  }

  delete(machine: Machine): void {
    this.chips.delete(machine);
    this.changes++;
  }

  get size(): number {
    return this.chips.size;
  }

  /**
   * Advances `dt` seconds of circuit time, a tick at a time, running every program wherever it's due. If a chip comes
   * or goes while it's waiting on a program, it stops there: the time still owed is kept for the next step, with the
   * chips as they are then.
   */
  async step(dt: number): Promise<void> {
    this.pending += Math.max(dt, 0);
    const changes = this.changes;
    while (this.pending >= TICK - 1e-12 && this.changes === changes) {
      this.pending = Math.max(0, this.pending - TICK);
      const chips = [...this.chips];
      for (const chip of chips) chip.beforeTick();
      const { converged } = this.circuit.step(TICK);
      // One after another: programs on this thread (the tests') share one set of Arduino functions, so two at once
      // would mix up whose pins are whose. Each is quick: it only runs until its next delay().
      for (const chip of chips) {
        if (this.chips.has(chip)) await chip.afterTick(converged);
      }
    }
  }
}
