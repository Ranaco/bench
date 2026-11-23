/**
 * The Arduino functions your program calls: the same names and meanings as on a real board, in TypeScript. The one
 * difference is delay(): on a real board it simply stops your program; here your program has to let the simulator
 * carry on meanwhile, so it's `await delay(500)`, inside an `async` setup() or loop().
 *
 * These calls only work while Bench is running your program. They talk to whichever board is running it right now.
 */

export const LOW = 0;
export const HIGH = 1;
export type PinLevel = typeof LOW | typeof HIGH;

export const INPUT = 'input';
export const OUTPUT = 'output';
export const INPUT_PULLUP = 'pullup';
export const INPUT_PULLDOWN = 'pulldown';
export type PinMode = typeof INPUT | typeof OUTPUT | typeof INPUT_PULLUP | typeof INPUT_PULLDOWN;

/** What a program talks to: one board, at one moment. Bench provides it; your program never sees it. */
export interface Host {
  /** Milliseconds since the board started. */
  millis(): number;
  pinMode(pin: number, mode: PinMode): void;
  digitalWrite(pin: number, level: PinLevel): void;
  digitalRead(pin: number): PinLevel;
  analogRead(pin: number): number;
  print(text: string): void;
}

/** Thrown for a mistake in how the program uses these functions, as opposed to a bug in Bench. */
export class ProgramMistake extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProgramMistake';
  }
}

/** The program's half of a delay: when it's to wake, and how it's woken. Bench's runner holds the other half. */
export interface Waiting {
  readonly until: number;
  readonly wake: () => void;
}

interface Session {
  readonly host: Host;
  /** Tells the runner the program is waiting, so it can let time pass. */
  readonly park: (waiting: Waiting) => void;
  /** A delay that's been asked for and not yet woken. */
  waiting: Waiting | undefined;
}

let session: Session | undefined;

/** Bench's runner: connects the program to a board while it runs, and disconnects it after. Not for your program. */
export function attach(next: Session | undefined): void {
  session = next;
}

/** The board, checking the call is allowed: while running, and not while a delay() is still waiting. */
function board(what: string): Session {
  if (!session) throw new ProgramMistake(`${what} only works inside setup() or loop(), while Bench runs your program.`);
  if (session.waiting) {
    throw new ProgramMistake(`${what} was called while a delay() was still waiting. Did you forget \`await\` in front of delay()?`);
  }
  return session;
}

export function millis(): number {
  return board('millis()').host.millis();
}

export function pinMode(pin: number, mode: PinMode): void {
  board('pinMode()').host.pinMode(pin, mode);
}

export function digitalWrite(pin: number, level: PinLevel): void {
  board('digitalWrite()').host.digitalWrite(pin, level);
}

export function digitalRead(pin: number): PinLevel {
  return board('digitalRead()').host.digitalRead(pin);
}

export function analogRead(pin: number): number {
  return board('analogRead()').host.analogRead(pin);
}

/** Waits `ms` milliseconds of the board's time, while the rest of the circuit carries on. Always `await` it. */
export function delay(ms: number): Promise<void> {
  const s = board('delay()');
  return new Promise<void>((resolve) => {
    const waiting: Waiting = {
      until: s.host.millis() + Math.max(0, ms),
      wake: () => {
        s.waiting = undefined;
        resolve();
      },
    };
    s.waiting = waiting;
    s.park(waiting);
  });
}

/** The serial port: what your program prints, for the Serial Monitor. */
export const Serial = {
  /** Real boards need the speed set; Bench's serial port takes any. */
  begin(baud: number): void {
    board('Serial.begin()');
  },
  print(value: unknown): void {
    board('Serial.print()').host.print(String(value));
  },
  println(value: unknown = ''): void {
    board('Serial.println()').host.print(`${String(value)}\n`);
  },
};
