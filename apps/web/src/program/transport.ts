import { FRESH, isDue, ProgramMistake, type ProgramTransport, type RunnerState, type Snapshot, type Writes } from '@bench/engine';
import type { FromWorker } from './worker';

/**
 * How long, in real time, the program may take to reach its next delay() or finish a loop() before Bench calls it
 * stuck. Ours: a loop with no delay() in it takes microseconds; a few seconds without an answer is a loop that never
 * ends. A real ESP32 has a watchdog that resets a program stuck like that, too.
 */
export const WATCHDOG_MS = 3000;

/** Runs your program in a worker, one snapshot at a time, and stops it if it gets stuck. */
export class WorkerTransport implements ProgramTransport {
  private worker: Worker | undefined = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private state: RunnerState = FRESH;
  /** How long each round trip took, ms, the last few: for the Serial Monitor to say if the page can't keep up. */
  readonly trips: number[] = [];

  due(millis: number): boolean {
    return this.worker !== undefined && isDue(this.state, millis);
  }

  resume(snapshot: Snapshot): Promise<Writes> {
    const worker = this.worker;
    if (!worker) return Promise.reject(new ProgramMistake('Your program was stopped.'));
    const sent = performance.now();
    return new Promise<Writes>((resolve, reject) => {
      const watchdog = window.setTimeout(() => {
        worker.onmessage = null;
        this.stop();
        reject(
          new ProgramMistake(
            `Your program ran for ${String(WATCHDOG_MS / 1000)} seconds without reaching a delay() or the end of loop(): a loop that never ends? Bench stopped it, as a real ESP32's watchdog would.`,
          ),
        );
      }, WATCHDOG_MS);
      worker.onmessage = (event: MessageEvent<FromWorker>) => {
        window.clearTimeout(watchdog);
        worker.onmessage = null;
        this.trips.push(performance.now() - sent);
        if (this.trips.length > 50) this.trips.shift();
        this.state = event.data.state;
        if ('error' in event.data) {
          const { name, message } = event.data.error;
          reject(name === 'ProgramMistake' ? new ProgramMistake(message) : new Error(message));
        } else {
          resolve(event.data.writes);
        }
      };
      worker.postMessage(snapshot);
    });
  }

  /** Stops the program for good: its worker is gone. */
  stop(): void {
    this.worker?.terminate();
    this.worker = undefined;
  }
}
