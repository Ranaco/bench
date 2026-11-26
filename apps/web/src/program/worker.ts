/// <reference lib="webworker" />
/**
 * One microcontroller's program, running in a worker: off the page's own thread, so a loop that never waits can be
 * stopped rather than freezing Bench, and each chip in a worker of its own. The first message is the program's code;
 * each one after is a snapshot of the pins, and each reply is what the program did, and where it's got to.
 */
import { CodeError, FRESH, loadProgram, ProgramRunner, type ModuleSource, type RunnerState, type Snapshot, type Writes } from '@bench/engine';

export type ToWorker = { readonly load: ModuleSource } | Snapshot;

export type FromWorker =
  | { readonly writes: Writes; readonly state: RunnerState }
  | { readonly error: { readonly name: string; readonly message: string }; readonly state: RunnerState };

let runner: ProgramRunner | undefined;
/** Why the program couldn't be loaded: said at the first snapshot, as a mistake in it. */
let unloadable: Error | undefined;

/** A load error, as the learner should read it: where it is, and what's wrong. */
function described(error: unknown): Error {
  if (error instanceof CodeError) {
    const at = error.line === undefined ? '' : ` (line ${String(error.line)})`;
    const mistake = new Error(`${error.file}${at}: ${error.message}`);
    mistake.name = 'ProgramMistake';
    return mistake;
  }
  return error instanceof Error ? error : new Error(String(error));
}

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const data = event.data;
  if ('load' in data) {
    try {
      runner = new ProgramRunner(loadProgram(data.load));
      unloadable = undefined;
    } catch (error) {
      unloadable = described(error);
    }
    return;
  }
  const failed = unloadable ?? (runner ? undefined : new Error('No program was loaded.'));
  if (failed || !runner) {
    const error = failed ?? new Error('No program was loaded.');
    self.postMessage({ error: { name: error.name, message: error.message }, state: { ...FRESH, failed: true } } satisfies FromWorker);
    return;
  }
  const current = runner;
  current.resume(data).then(
    (writes) => {
      self.postMessage({ writes, state: current.state() } satisfies FromWorker);
    },
    (error: unknown) => {
      const e = error instanceof Error ? error : new Error(String(error));
      self.postMessage({ error: { name: e.name, message: e.message }, state: current.state() } satisfies FromWorker);
    },
  );
};
