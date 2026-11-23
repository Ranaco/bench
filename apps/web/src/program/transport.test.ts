/** Your program's worker, from the page's side: stopping it, and its watchdog. */
import type { Snapshot } from '@bench/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WATCHDOG_MS, WorkerTransport } from './transport';

/** A worker that never answers: a program partway through, or stuck. */
class SilentWorker {
  static made: SilentWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  terminated = false;

  constructor() {
    SilentWorker.made.push(this);
  }

  postMessage(): void {
    // Never answers.
  }

  terminate(): void {
    this.terminated = true;
  }
}

const SNAPSHOT: Snapshot = { millis: 1, pins: {}, analog: {}, supplyVolts: 3.3 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', SilentWorker);
  vi.stubGlobal('window', globalThis);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  SilentWorker.made = [];
});

describe('Your program in a worker', () => {
  it('ends a step still waiting on the worker as soon as it’s stopped, not at the watchdog', async () => {
    const transport = new WorkerTransport();
    const step = transport.resume(SNAPSHOT);
    transport.stop();
    await expect(step).rejects.toThrow('Your program was stopped.');
    expect(SilentWorker.made[0]?.terminated).toBe(true);
    expect(transport.due(2)).toBe(false);
  });

  it('stops one that never answers at the watchdog, saying why', async () => {
    const transport = new WorkerTransport();
    const step = transport.resume(SNAPSHOT);
    const caught = expect(step).rejects.toThrow(/without reaching a delay\(\)/);
    vi.advanceTimersByTime(WATCHDOG_MS);
    await caught;
    expect(SilentWorker.made[0]?.terminated).toBe(true);
  });
});
