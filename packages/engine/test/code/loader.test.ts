/** The loader: part code and programs as text, compiled and linked to the engine, as the editor and the board run them. */
import { describe, expect, it } from 'vitest';
import { buildCode, Circuit, CodeError, DEFAULTS, GROUND, loadModule, loadProgram, NotWrittenYet, ProgramRunner, Resistor } from '../../src/index';
import { Source } from '../fixtures';

const RESISTOR_LIKE_LED = `
import { type Node, type Part, type Readings, type Stamp } from 'bench';

/** Not an LED at all: a 100 Ω resistor, to see the board use whatever code it's given. */
export class Led implements Part {
  burnt = false;
  temperature = 25;
  readonly spec = { maxAmps: 0.03 } as never;
  constructor(readonly name: string, readonly anode: Node, readonly cathode: Node) {}
  stamp(s: Stamp): void {
    s.conductance(this.anode, this.cathode, 1 / 100);
  }
  current(r: Readings): number {
    return r.across(this.anode, this.cathode) / 100;
  }
}
`;

describe('Loading part code from text', () => {
  it('runs it in a circuit, its imports linked to the engine', () => {
    const Led = loadModule('led', { text: RESISTOR_LIKE_LED, file: 'led.ts' }, DEFAULTS);
    const c = new Circuit();
    const a = c.node('a');
    c.add(new Source('V1', a, GROUND, 1));
    const led = c.add(new Led('D1', a, GROUND));
    c.step(0);
    expect(c.currentThrough(led)).toBeCloseTo(0.01, 9);
  });

  it('keeps the old relative imports the lesson files use', () => {
    const text = RESISTOR_LIKE_LED.replace("from 'bench'", "from '../types'");
    expect(() => loadModule('led', { text, file: 'led.ts' }, DEFAULTS)).not.toThrow();
  });

  it('throws the engine’s own NotWrittenYet from a stub, so the board knows a job is still to do', () => {
    const stub = `
      import { NotWrittenYet, type Node, type Part, type Stamp } from 'bench';
      export class Led implements Part {
        constructor(readonly name: string, readonly anode: Node, readonly cathode: Node) {}
        stamp(_s: Stamp): void { throw new NotWrittenYet(this.name, 'led.ts'); }
        current(): number { throw new NotWrittenYet(this.name, 'led.ts'); }
      }`;
    const Led = loadModule('led', { text: stub, file: 'led.ts' }, DEFAULTS);
    expect(() => new Led('D1', 1 as never, 2 as never).current({} as never)).toThrow(NotWrittenYet);
  });

  it('says where code doesn’t parse', () => {
    const broken = 'export class Led {}\nconst x = ;\n';
    let error: unknown;
    try {
      loadModule('led', { text: broken, file: 'led.ts' }, DEFAULTS);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(CodeError);
    expect((error as CodeError).file).toBe('led.ts');
    expect((error as CodeError).line).toBe(2);
  });

  it('says what to export when the class isn’t there', () => {
    expect(() => loadModule('led', { text: 'export const nothing = 1;', file: 'led.ts' }, DEFAULTS)).toThrow(/export a class called Led/);
  });

  it('names an import it doesn’t have', () => {
    // Used, or it's dropped as a type-only import.
    const text = "import { pad } from 'left-pad';\nexport class Led { readonly pad = pad; }";
    expect(() => loadModule('led', { text, file: 'led.ts' }, DEFAULTS)).toThrow(/nothing called 'left-pad'/);
  });

  it('builds a board’s parts from one set: an ESP32 written to use the pin code beside it gets that pin code', () => {
    const pin = `
      import { Gpio as Base } from 'bench/gpio';
      export class Gpio extends Base { readonly custom = true; }`;
    const esp32 = `
      import { Esp32 as Base } from 'bench/esp32';
      import { Gpio } from 'bench/gpio';
      export class Esp32 extends Base { readonly pinCode = Gpio; }`;
    const code = buildCode({ gpio: { text: pin, file: 'gpio.ts' }, esp32: { text: esp32, file: 'esp32.ts' } }, DEFAULTS);
    expect(code.gpio).not.toBe(DEFAULTS.gpio);
    const chip = new code.esp32('U1', 1 as never, 2 as never, {});
    expect((chip as unknown as { pinCode: unknown }).pinCode).toBe(code.gpio);
    expect(code.resistor).toBe(Resistor); // what isn't given stays as it was
  });
});

describe('Loading a program from text', () => {
  it('gives its setup() and loop(), with the Arduino functions linked', async () => {
    const program = loadProgram({
      text: `import { delay, digitalWrite, HIGH, LOW, OUTPUT, pinMode } from 'bench/arduino';
        export function setup(): void { pinMode(2, OUTPUT); }
        export async function loop(): Promise<void> { digitalWrite(2, HIGH); await delay(5); digitalWrite(2, LOW); await delay(5); }`,
      file: 'U1.ts',
    });
    const runner = new ProgramRunner(program);
    const at = (millis: number) => ({ millis, pins: { 2: { level: 'low' as const, volts: 0 } }, analog: {}, supplyVolts: 3.3 });
    expect((await runner.resume(at(1))).modes).toEqual([[2, 'output']]);
    expect((await runner.resume(at(2))).levels).toEqual([[2, true]]);
  });

  it('needs a loop()', () => {
    expect(() => loadProgram({ text: 'export function setup() {}', file: 'U1.ts' })).toThrow(/loop\(\)/);
  });
});
