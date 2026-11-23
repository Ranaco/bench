/// <reference lib="webworker" />
/**
 * Your program, running in a worker: off the page's own thread, so a loop that never waits can be stopped rather than
 * freezing Bench. Each message is a snapshot of the pins; each reply is what the program did, and where it's got to.
 */
import { ProgramRunner, yourProgram, type RunnerState, type Snapshot, type Writes } from '@bench/engine';

export type FromWorker =
  | { readonly writes: Writes; readonly state: RunnerState }
  | { readonly error: { readonly name: string; readonly message: string }; readonly state: RunnerState };

const runner = new ProgramRunner(yourProgram);

self.onmessage = (event: MessageEvent<Snapshot>) => {
  runner.resume(event.data).then(
    (writes) => {
      self.postMessage({ writes, state: runner.state() } satisfies FromWorker);
    },
    (error: unknown) => {
      const e = error instanceof Error ? error : new Error(String(error));
      self.postMessage({ error: { name: e.name, message: e.message }, state: runner.state() } satisfies FromWorker);
    },
  );
};
