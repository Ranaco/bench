/** The program runner on its own: no circuit, just snapshots in and writes out. */
import { describe, expect, it } from 'vitest';
import { isDue, ProgramRunner, type Snapshot } from '../../src/index';
import {
  delay,
  digitalRead,
  digitalWrite,
  HIGH,
  INPUT_PULLUP,
  LOW,
  millis,
  OUTPUT,
  pinMode,
  ProgramMistake,
  Serial,
} from '../../src/program/arduino';

const PINS: Snapshot['pins'] = {
  34: { level: 'low', volts: 0, inputOnly: true },
  2: { level: 'low', volts: 0 },
  4: { level: 'high', volts: 3.3 },
  5: { level: 'unknown', volts: 2 },
  6: { level: 'unknown', volts: 1 },
};

const at = (millis: number): Snapshot => ({ millis, pins: PINS, analog: { 4: 4095 }, supplyVolts: 3.3 });

/** Runs `runner` at every millisecond up to `until`, the way the circuit would, collecting what it printed. */
async function runTo(runner: ProgramRunner, until: number) {
  let printed = '';
  for (let ms = 1; ms <= until; ms++) {
    if (runner.due(ms)) printed += (await runner.resume(at(ms))).printed;
  }
  return printed;
}

describe('ProgramRunner', () => {
  it('runs setup() once, then loop() at most once a millisecond when it never waits', async () => {
    let setups = 0;
    let loops = 0;
    const runner = new ProgramRunner({
      setup() {
        setups++;
      },
      loop() {
        loops++;
      },
    });
    await runTo(runner, 5);
    expect(setups).toBe(1);
    expect(loops).toBe(4); // from 2 ms, so what setup() set up at 1 ms is in the circuit by then
  });

  it('waits in delay() for exactly the time asked, and goes straight round into the next loop()', async () => {
    const runner = new ProgramRunner({
      async loop() {
        Serial.println(millis());
        await delay(500);
      },
    });
    expect(await runTo(runner, 1600)).toBe('1\n501\n1001\n1501\n'); // no setup(): loop() from 1 ms
  });

  it('records pinMode() and digitalWrite() in the order they were called', async () => {
    const runner = new ProgramRunner({
      setup() {
        pinMode(2, OUTPUT);
        pinMode(4, INPUT_PULLUP);
      },
      async loop() {
        digitalWrite(2, HIGH);
        await delay(10);
        digitalWrite(2, LOW);
        await delay(10);
      },
    });
    expect((await runner.resume(at(1))).modes).toEqual([
      [2, 'output'],
      [4, 'pullup'],
    ]);
    expect((await runner.resume(at(2))).levels).toEqual([[2, true]]);
    expect((await runner.resume(at(12))).levels).toEqual([[2, false]]);
  });

  it('reads pins from the snapshot; one that could read either way reads the nearer side, and is noted', async () => {
    const reads: number[] = [];
    const runner = new ProgramRunner({
      loop() {
        reads.push(digitalRead(2), digitalRead(4), digitalRead(5), digitalRead(6));
      },
    });
    const writes = await runner.resume(at(1));
    expect(reads).toEqual([LOW, HIGH, HIGH, LOW]); // 2 V is over half of 3.3 V; 1 V is under
    expect(writes.floating).toEqual([5, 6]);
  });

  it('says what went wrong when a delay() isn’t awaited', async () => {
    const midway = new ProgramRunner({
      loop() {
        void delay(100);
        digitalWrite(2, HIGH);
      },
    });
    await expect(midway.resume(at(1))).rejects.toThrow(/forget `await`/);
    expect(midway.due(2)).toBe(false); // it stays stopped

    const atTheEnd = new ProgramRunner({
      loop() {
        void delay(100);
      },
    });
    await expect(atTheEnd.resume(at(1))).rejects.toThrow(/forget `await`/);
  });

  it('says so when the program waits on something other than delay()', async () => {
    const runner = new ProgramRunner({
      async loop() {
        await new Promise(() => undefined);
      },
    });
    await expect(runner.resume(at(1))).rejects.toThrow(/other than delay/);
  });

  it('names a pin the board doesn’t have, and stops on the program’s own errors', async () => {
    const missing = new ProgramRunner({
      loop() {
        digitalRead(7);
      },
    });
    await expect(missing.resume(at(1))).rejects.toThrow(/GPIO7 isn’t one of this board’s pins/);

    const crashing = new ProgramRunner({
      loop() {
        throw new Error('boom');
      },
    });
    await expect(crashing.resume(at(1))).rejects.toThrow('boom');
    expect(crashing.failed?.message).toBe('boom');
  });

  it('refuses an output or a pull on an input-only pin, as the chip has neither', async () => {
    const output = new ProgramRunner({
      setup() {
        pinMode(34, OUTPUT);
      },
      loop() {
        // never reached
      },
    });
    await expect(output.resume(at(1))).rejects.toThrow(/GPIO34 can only be an INPUT/);
    const pulled = new ProgramRunner({
      setup() {
        pinMode(34, INPUT_PULLUP);
      },
      loop() {
        // never reached
      },
    });
    await expect(pulled.resume(at(1))).rejects.toThrow(/no pull-up or pull-down/);
  });

  it('tells a worker’s caller when it’s next due, in plain data that agrees with the runner itself', async () => {
    const runner = new ProgramRunner({
      async loop() {
        await delay(100);
      },
    });
    for (let ms = 1; ms <= 350; ms++) {
      expect(isDue(runner.state(), ms), `${String(ms)} ms`).toBe(runner.due(ms));
      if (runner.due(ms)) await runner.resume(at(ms));
    }
    expect(runner.state().until).toBe(401);
  });

  it('refuses the Arduino functions outside setup() and loop()', () => {
    expect(() => digitalRead(2)).toThrow(ProgramMistake);
    expect(() => digitalRead(2)).toThrow(/only works inside setup\(\) or loop\(\)/);
  });
});
