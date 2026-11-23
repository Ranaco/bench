import { attach, HIGH, LOW, ProgramMistake, type Host, type PinLevel, type PinMode, type Waiting } from './arduino';
import type { Level } from '../lesson-6-microcontroller/gpio';

/** A program: setup() once, then loop() over and over. Either may be async, to `await delay()`. */
export interface Program {
  setup?(): void | Promise<void>;
  loop(): void | Promise<void>;
}

/** What the program can see at one moment: plain data, so it can cross to a worker and back. */
export interface Snapshot {
  /** Milliseconds since the board started. */
  readonly millis: number;
  /** Each pin by number: what it reads, its voltage against the chip's ground, and whether it can only read. */
  readonly pins: Readonly<Partial<Record<number, { readonly level: Level; readonly volts: number; readonly inputOnly?: boolean }>>>;
  /** Each pin's analogRead() value, for the pins that have one. */
  readonly analog: Readonly<Partial<Record<number, number>>>;
  /** The supply, V: a pin that could read either way reads whichever side of half of it it's on. */
  readonly supplyVolts: number;
}

/** What the program did in one go: plain data again. */
export interface Writes {
  /** pinMode() calls, in order. */
  readonly modes: (readonly [pin: number, mode: PinMode])[];
  /** digitalWrite() calls, in order. */
  readonly levels: (readonly [pin: number, high: boolean])[];
  /** What it printed. */
  readonly printed: string;
  /** Pins it read while they could have read either way. */
  readonly floating: number[];
}

/** A Host that reads from a snapshot and writes down what the program does. */
class SnapshotHost implements Host {
  readonly writes: { modes: [number, PinMode][]; levels: [number, boolean][]; printed: string; floating: number[] } = {
    modes: [],
    levels: [],
    printed: '',
    floating: [],
  };

  constructor(private readonly snapshot: Snapshot) {}

  private pin(pin: number) {
    const found = this.snapshot.pins[pin];
    if (!Number.isInteger(pin) || !found) throw new ProgramMistake(`GPIO${String(pin)} isn’t one of this board’s pins.`);
    return found;
  }

  millis(): number {
    return this.snapshot.millis;
  }

  pinMode(pin: number, mode: PinMode): void {
    if (this.pin(pin).inputOnly && mode !== 'input') {
      throw new ProgramMistake(
        `GPIO${String(pin)} can only be an INPUT: the datasheet says GPIO34 to 39 have no output driver and no pull-up or pull-down.`,
      );
    }
    this.writes.modes.push([pin, mode]);
  }

  digitalWrite(pin: number, level: PinLevel): void {
    if (this.pin(pin).inputOnly) throw new ProgramMistake(`GPIO${String(pin)} can only read: it has no output driver.`);
    this.writes.levels.push([pin, level === HIGH]);
  }

  digitalRead(pin: number): PinLevel {
    const { level, volts } = this.pin(pin);
    if (level === 'high') return HIGH;
    if (level === 'low') return LOW;
    // Could read either way: Bench picks the nearer side, and says so; a real chip could give either.
    this.writes.floating.push(pin);
    return volts >= this.snapshot.supplyVolts / 2 ? HIGH : LOW;
  }

  analogRead(pin: number): number {
    this.pin(pin);
    const value = this.snapshot.analog[pin];
    if (value === undefined) throw new ProgramMistake(`GPIO${String(pin)} can’t be read with analogRead() on this board.`);
    return value;
  }

  print(text: string): void {
    this.writes.printed += text;
  }
}

// Every place Bench runs (a page, a worker, Node for the tests) has setTimeout; the engine's types just don't say so.
declare function setTimeout(run: () => void, ms: number): unknown;

/** Where a program is, as plain data: enough to tell whether it's due without asking it. */
export interface RunnerState {
  /** When the delay() it's waiting in ends, ms; undefined when it isn't waiting. */
  readonly until: number | undefined;
  readonly stage: 'setup' | 'loop';
  /** The millisecond the last loop() started (or setup() finished), -1 before either. */
  readonly lastLoop: number;
  readonly failed: boolean;
}

/** The program before it's run: setup() first (if it has none, the first loop() is due straight away anyway). */
export const FRESH: RunnerState = { until: undefined, stage: 'setup', lastLoop: -1, failed: false };

/** Whether a program in `state` has anything to do at `millis`: waking from a delay, or starting setup() or a loop(). */
export function isDue(state: RunnerState, millis: number): boolean {
  if (state.failed) return false;
  if (state.until !== undefined) return millis >= state.until;
  return !(state.stage === 'loop' && state.lastLoop === millis);
}

/** A macrotask: by the time it runs, every awaited continuation the program queued has run too. */
const afterMicrotasks = () =>
  new Promise<'stalled'>((resolve) => {
    setTimeout(() => {
      resolve('stalled');
    }, 0);
  });

/** Anything thrown, as an Error. */
const asError = (thrown: unknown) => (thrown instanceof Error ? thrown : new Error(String(thrown)));

/**
 * Runs a program on a board's clock, a step at a time. resume() carries it on from where it was, with what the board
 * reads right now, until it waits in a delay() or finishes setup() or a loop(): loop() runs at most once per
 * millisecond, where a real chip would go round it far faster. The same runner works on Bench's own thread or in a
 * worker: it only takes snapshots and gives back writes.
 */
export class ProgramRunner {
  private readonly session: { host: Host; park: (waiting: Waiting) => void; waiting: Waiting | undefined };
  private stage: 'setup' | 'loop';
  /** The setup() or loop() call that hasn't finished yet. */
  private running = false;
  private lastLoop = -1;
  /** The millisecond being run, for anything that finishes inside it. */
  private clock = 0;
  private failure: Error | undefined;
  private settle: ((outcome: 'parked' | 'returned') => void) | undefined;

  constructor(private readonly program: Program) {
    this.stage = program.setup ? 'setup' : 'loop';
    this.session = {
      host: new SnapshotHost({ millis: 0, pins: {}, analog: {}, supplyVolts: 0 }),
      park: () => this.settle?.('parked'),
      waiting: undefined,
    };
  }

  /** Whether the program has anything to do at `millis`: waking from a delay, or starting setup() or a loop(). */
  due(millis: number): boolean {
    return !this.running || this.session.waiting ? isDue(this.state(), millis) : false;
  }

  /** Where the program is, as plain data: what a worker sends back, so Bench knows when it's next due. */
  state(): RunnerState {
    return { until: this.session.waiting?.until, stage: this.stage, lastLoop: this.lastLoop, failed: this.failure !== undefined };
  }

  /** The program's mistake or crash, once it's had one: it doesn't run again. */
  get failed(): Error | undefined {
    return this.failure;
  }

  /**
   * Carries the program on, against `snapshot`, until it waits in a delay(); resolves with what it did. A loop() that
   * started in an earlier millisecond goes straight on into the next, as a real chip does; one that started this
   * millisecond, or setup(), waits for the next millisecond. What the program writes reaches the circuit from the next
   * millisecond, so that's when its first loop() can see what setup() did.
   */
  async resume(snapshot: Snapshot): Promise<Writes> {
    const host = new SnapshotHost(snapshot);
    const millis = snapshot.millis;
    if (!this.due(millis)) return host.writes;
    this.clock = millis;
    this.session.host = host;
    attach(this.session);
    try {
      let outcome = await this.carryOn(() => {
        const waiting = this.session.waiting;
        if (waiting) waiting.wake();
        else this.start(millis);
      });
      while (outcome === 'returned' && this.due(millis)) {
        outcome = await this.carryOn(() => {
          this.start(millis);
        });
      }
      return host.writes;
    } finally {
      this.settle = undefined;
      attach(undefined);
    }
  }

  /** Sets the program going with `go`, then waits until it parks in a delay() or returns. */
  private async carryOn(go: () => void): Promise<'parked' | 'returned'> {
    const outcome = new Promise<'parked' | 'returned'>((resolve) => {
      this.settle = resolve;
    });
    go();
    const result = await Promise.race([outcome, afterMicrotasks()]);
    if (result === 'stalled' && this.failure === undefined) {
      this.failure = new ProgramMistake(
        'Your program is waiting on something other than delay(), which never comes. Only `await delay()` lets time pass.',
      );
    }
    if (this.failure !== undefined) throw this.failure;
    return result === 'stalled' ? 'parked' : result;
  }

  private start(millis: number): void {
    const stage = this.stage;
    if (stage === 'loop') this.lastLoop = millis;
    this.running = true;
    let call: void | Promise<void>;
    try {
      call = stage === 'setup' ? this.program.setup?.() : this.program.loop();
    } catch (error) {
      this.running = false;
      this.failure = asError(error);
      this.settle?.('returned');
      return;
    }
    void Promise.resolve(call).then(
      () => {
        this.running = false;
        if (this.session.waiting) {
          this.failure = new ProgramMistake(
            `${stage}() finished while a delay() was still waiting: did you forget \`await\` in front of delay()?`,
          );
        }
        if (stage === 'setup') {
          // loop() starts the millisecond after, so what setup() set up (a pull-up, an output) is in the circuit first.
          this.stage = 'loop';
          this.lastLoop = this.clock;
        }
        this.settle?.('returned');
      },
      (error: unknown) => {
        this.running = false;
        this.failure = asError(error);
        this.settle?.('returned');
      },
    );
  }
}
