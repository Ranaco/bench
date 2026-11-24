import { FRESH, isDue, ProgramMistake, type ModuleSource, type ProgramTransport, type RunnerState, type Snapshot, type Writes } from '@bench/engine';
import type { FromWorker, ToWorker } from './worker';

/**
 * How long, in real time, the program may take to reach its next delay() or finish a loop() before Bench calls it
 * stuck. Ours: a loop with no delay() in it takes microseconds; a few seconds without an answer is a loop that never
 * ends. A real ESP32 has a watchdog that resets a program stuck like that, too.
 */
export const WATCHDOG_MS = 3000;

/** Runs one chip's program in a worker of its own, one snapshot at a time, and stops it if it gets stuck. */
export class WorkerTransport implements ProgramTransport {
  private worker: Worker | undefined = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

  /** `program` is the program's code, as text. */
  constructor(program: ModuleSource) {
    this.worker?.postMessage({ load: program } satisfies ToWorker);
  }
  private state: RunnerState = FRESH;
  /** Ends the resume in flight, if there is one: for stop(). */
  private abandon: (() => void) | undefined;

  due(millis: number): boolean {
    return this.worker !== undefined && isDue(this.state, millis);
  }

  resume(snapshot: Snapshot): Promise<Writes> {
    const worker = this.worker;
    if (!worker) return Promise.reject(new ProgramMistake('Your program was stopped.'));
    return new Promise<Writes>((resolve, reject) => {
      this.abandon = () => {
        window.clearTimeout(watchdog);
        worker.onmessage = null;
        reject(new ProgramMistake('Your program was stopped.'));
      };
      const watchdog = window.setTimeout(() => {
        worker.onmessage = null;
        // Its own reason, below, not stop()'s "was stopped".
        this.abandon = undefined;
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
        this.abandon = undefined;
        this.state = event.data.state;
        if ('error' in event.data) {
          const { name, message } = event.data.error;
          reject(name === 'ProgramMistake' ? new ProgramMistake(message) : new Error(message));
        } else {
          resolve(event.data.writes);
        }
      };
      worker.postMessage(snapshot satisfies ToWorker);
    });
  }

  /** Stops the program for good: its worker is gone, and a resume still waiting on it ends now, not at the watchdog. */
  stop(): void {
    const abandon = this.abandon;
    this.abandon = undefined;
    this.worker?.terminate();
    this.worker = undefined;
    abandon?.();
  }
}
