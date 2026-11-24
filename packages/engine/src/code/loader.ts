/**
 * Runs part code and programs written as text: in the browser's editor, or in files outside the engine. One loader
 * for everything, so the tests check exactly what the board runs.
 *
 * TypeScript is turned into plain JavaScript by sucrase (it only strips the types, it doesn't check them; the editor
 * does that), then run with its imports linked to Bench's own engine: `bench` for the engine, `bench/arduino` for a
 * program's functions, and `bench/<module>` for another part's code. The relative paths the lesson files have always
 * used (`../types`, `../thermal`, `../lesson-2-switches/switch`…) mean the same, so those files run unchanged.
 */
import { transform } from 'sucrase';
import * as api from '../index';
import * as arduino from '../program/arduino';
import type { Program } from '../program/runner';
import { MODULES, type Code, type ModuleId } from '../models/contracts';

/** Something wrong with code before it ever ran: it doesn't parse, or it doesn't export what it should. */
export class CodeError extends Error {
  constructor(
    /** The file, as the learner knows it. */
    readonly file: string,
    message: string,
    /** Where, 1-based, when known. */
    readonly line?: number,
    readonly column?: number,
  ) {
    super(message);
    this.name = 'CodeError';
  }
}

/** The class each module's code has to export. */
export const CLASS_NAMES: Readonly<Record<ModuleId, string>> = {
  battery: 'Battery',
  resistor: 'Resistor',
  led: 'Led',
  switch: 'Switch',
  'slide-switch': 'SlideSwitch',
  potentiometer: 'Potentiometer',
  capacitor: 'Capacitor',
  electrolytic: 'Electrolytic',
  transistor: 'Transistor',
  gpio: 'Gpio',
  esp32: 'Esp32',
};

/** The modules a module's code builds parts of: built first, so it can use them. */
const NEEDS: Partial<Readonly<Record<ModuleId, readonly ModuleId[]>>> = {
  'slide-switch': ['switch'],
  electrolytic: ['capacitor'],
  esp32: ['gpio'],
};

/** Old relative paths to another part's code, as the lesson files have them, and the module each means. */
const LEGACY_MODULES: Readonly<Partial<Record<string, ModuleId>>> = {
  '../lesson-1-light-an-led/led': 'led',
  '../lesson-2-switches/switch': 'switch',
  '../lesson-3-knob/potentiometer': 'potentiometer',
  '../lesson-4-capacitors/capacitor': 'capacitor',
  '../lesson-5-transistors/transistor': 'transistor',
  '../lesson-6-microcontroller/gpio': 'gpio',
  '../parts/battery': 'battery',
  '../parts/resistor': 'resistor',
  '../parts/slide-switch': 'slide-switch',
  '../parts/electrolytic': 'electrolytic',
  '../parts/esp32': 'esp32',
};

/** Old relative paths to the engine itself. */
const LEGACY_ENGINE = new Set(['../types', '../thermal', '../circuit', '../materials', '../measure', '../linear', '../parts/ground', '../parts/supply', '../parts/wire', '../parts/junction']);

type Compiled = (require: (specifier: string) => unknown, exports: Record<string, unknown>, module: { exports: Record<string, unknown> }) => void;

const compiled = new Map<string, Compiled>();

/** The engine's own exports: what `bench` means. */
const engine = (): Readonly<Record<string, unknown>> => api;

/** Turns TypeScript into a function that runs it, or throws a CodeError saying where it doesn't parse. */
export function compile(text: string, file: string): Compiled {
  const key = `${file}\n${text}`;
  const known = compiled.get(key);
  if (known) return known;
  let code: string;
  try {
    code = transform(text, { transforms: ['typescript', 'imports'], filePath: file, disableESTransforms: true }).code;
  } catch (error) {
    const loc = (error as { loc?: { line: number; column: number } }).loc;
    const message = error instanceof Error ? error.message.replace(/ \(\d+:\d+\)$/, '') : String(error);
    throw new CodeError(file, message, loc?.line, loc === undefined ? undefined : loc.column + 1);
  }
  // A named function, so a stack trace through it names the learner's file.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- running the learner's own code is the point
  const run = new Function('require', 'exports', 'module', `${code}\n//# sourceURL=${file}`) as Compiled;
  compiled.set(key, run);
  return run;
}

/** Runs compiled code, linking its imports with `resolve`, and gives back what it exports. */
function evaluate(run: Compiled, file: string, resolve: (specifier: string) => unknown): Record<string, unknown> {
  const module = { exports: {} as Record<string, unknown> };
  const require = (specifier: string) => {
    const found = resolve(specifier);
    if (found === undefined) throw new CodeError(file, `Bench has nothing called '${specifier}' to import. Import from 'bench'.`);
    return found;
  };
  run(require, module.exports, module);
  return module.exports;
}

/** What a part's code may import, with `code` the code the other parts in its scope run. */
function partImports(code: Partial<Code>): (specifier: string) => unknown {
  const withModule = (id: ModuleId) => {
    const own = code[id];
    return own ? { ...engine(), [CLASS_NAMES[id]]: own } : engine();
  };
  return (specifier) => {
    if (specifier === 'bench' || LEGACY_ENGINE.has(specifier)) return engine();
    if (specifier === 'bench/arduino' || specifier === '../program/arduino') return arduino;
    const legacy = LEGACY_MODULES[specifier];
    if (legacy) return withModule(legacy);
    const named = specifier.startsWith('bench/') ? specifier.slice('bench/'.length) : undefined;
    if (named && (MODULES as readonly string[]).includes(named)) return withModule(named as ModuleId);
    return undefined;
  };
}

/** One module's code, as text, and the file it's in. */
export interface ModuleSource {
  readonly text: string;
  readonly file: string;
}

/**
 * Builds a full set of code: `sources` where given, `base` for the rest. A module that uses another (the ESP32 its
 * pins, the slide switch its contacts) gets the one built here.
 */
export function buildCode(sources: Partial<Readonly<Record<ModuleId, ModuleSource>>>, base: Code): Code {
  const code: Partial<Record<ModuleId, unknown>> = {};
  const build = (id: ModuleId): void => {
    if (code[id] !== undefined) return;
    for (const need of NEEDS[id] ?? []) build(need);
    const source = sources[id];
    if (!source) {
      code[id] = base[id];
      return;
    }
    const exports = evaluate(compile(source.text, source.file), source.file, partImports(code as Partial<Code>));
    const made = exports[CLASS_NAMES[id]];
    if (typeof made !== 'function') {
      throw new CodeError(source.file, `It has to export a class called ${CLASS_NAMES[id]}: \`export class ${CLASS_NAMES[id]} implements Part { … }\`.`);
    }
    code[id] = made;
  };
  for (const id of MODULES) build(id);
  return code as Code;
}

/** Loads one module's code on its own, with `base` for any other part it uses. */
export function loadModule<K extends ModuleId>(id: K, source: ModuleSource, base: Code): Code[K] {
  return buildCode({ [id]: source }, base)[id];
}

/** Loads a program (setup() and loop()) from its text. */
export function loadProgram(source: ModuleSource): Program {
  const exports = evaluate(compile(source.text, source.file), source.file, (specifier) =>
    specifier === 'bench/arduino' || specifier === '../program/arduino' || specifier === 'bench' ? arduino : undefined,
  );
  const { setup, loop } = exports;
  if (typeof loop !== 'function') throw new CodeError(source.file, 'A program has to export a loop() function: `export async function loop() { … }`.');
  if (setup !== undefined && typeof setup !== 'function') throw new CodeError(source.file, 'setup has to be a function: `export function setup() { … }`.');
  return { setup: setup as Program['setup'], loop: loop as Program['loop'] };
}
