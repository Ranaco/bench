/**
 * Trial runs for part code, before the board runs it on the page's own thread: each new version of a file is built
 * into a part and run for a few milliseconds in a worker. If it doesn't finish in TRIAL_MS, it's refused.
 */
import type { ModuleId, ModuleSource } from '@bench/engine';
import type { TrialReply, TrialRequest } from './trialWorker';

/** How long a trial may take, in real time. A part's code does its work in microseconds; this is a loop that never ends. */
export const TRIAL_MS = 2000;

/** Why code was refused, by its text: it's the same text every time, so its trial needn't run again. */
const verdicts = new Map<string, string | undefined>();

let next = 0;

/** Runs `source` (code for `module`) in a worker; resolves with why it's refused, or undefined if it finished. */
function runTrial(module: ModuleId, source: ModuleSource): Promise<string | undefined> {
  const known = verdicts.has(source.text);
  if (known) return Promise.resolve(verdicts.get(source.text));
  if (typeof Worker === 'undefined') return Promise.resolve(undefined); // tests: no workers, nothing to freeze
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./trialWorker.ts', import.meta.url), { type: 'module' });
    const id = next++;
    const done = (verdict: string | undefined) => {
      window.clearTimeout(timer);
      worker.terminate();
      verdicts.set(source.text, verdict);
      resolve(verdict);
    };
    const timer = window.setTimeout(() => {
      done(`It didn’t finish within ${String(TRIAL_MS / 1000)} seconds in a trial run: a loop that never ends? Bench won’t run it on the board until it does.`);
    }, TRIAL_MS);
    worker.onmessage = (event: MessageEvent<TrialReply>) => {
      if (event.data.id === id) done(undefined);
    };
    worker.onerror = () => {
      done(undefined); // couldn't even load: the board will say why
    };
    worker.postMessage({ id, module, source } satisfies TrialRequest);
  });
}

/** Trial-runs every source that hasn't been yet; resolves with the refused ones, by their text. */
export async function trialAll(sources: readonly { readonly module: ModuleId; readonly source: ModuleSource }[]): Promise<Map<string, string>> {
  const refused = new Map<string, string>();
  await Promise.all(
    sources.map(async ({ module, source }) => {
      const verdict = await runTrial(module, source);
      if (verdict !== undefined) refused.set(source.text, verdict);
    }),
  );
  return refused;
}
