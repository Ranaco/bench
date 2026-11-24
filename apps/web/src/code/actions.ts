/**
 * What you can do with a part's source from the Code window: start a project's own copy of it (from "Edit source",
 * with imports that read the same wherever it's kept), and remove that copy.
 */
import { MODULES, type ModuleId } from '@bench/engine';
import type { FileStore } from '../files/store';
import { DEFAULT_SOURCES } from './sources';

/** Old lesson folders, and the module each holds. */
const LESSON_FOLDERS: Readonly<Partial<Record<string, ModuleId>>> = {
  'lesson-1-light-an-led/led': 'led',
  'lesson-2-switches/switch': 'switch',
  'lesson-3-knob/potentiometer': 'potentiometer',
  'lesson-4-capacitors/capacitor': 'capacitor',
  'lesson-5-transistors/transistor': 'transistor',
  'lesson-6-microcontroller/gpio': 'gpio',
  'lesson-7-motors/motor': 'motor',
};

/** The engine's own files that `bench` stands for. */
const ENGINE_FILES = new Set(['types', 'thermal', 'circuit', 'materials', 'measure', 'linear', 'models/contracts', 'parts/ground', 'parts/supply', 'parts/wire', 'parts/junction']);

/** What one of Bench's relative imports means, as a `bench` import; the same when it isn't one. */
function benchName(specifier: string): string {
  if (!specifier.startsWith('.')) return specifier;
  const path = specifier.replace(/^(\.\.?\/)+/, '');
  if (ENGINE_FILES.has(path)) return 'bench';
  if (path === 'program/arduino') return 'bench/arduino';
  const lesson = LESSON_FOLDERS[path];
  if (lesson) return `bench/${lesson}`;
  const model = /^models\/([a-z0-9-]+)\/default$/.exec(path)?.[1];
  if (model && (MODULES as readonly string[]).includes(model)) return `bench/${model}`;
  const part = /^(?:parts\/)?([a-z0-9-]+)$/.exec(path)?.[1];
  if (part && (MODULES as readonly string[]).includes(part)) return `bench/${part}`;
  return specifier;
}

/** Code with its imports pointing at `bench`, so a copy reads the same wherever it's kept. */
export function portable(text: string): string {
  return text.replace(/(from\s+)(['"])([^'"]+)\2/g, (_whole, from: string, quote: string, specifier: string) => `${from}${quote}${benchName(specifier)}${quote}`);
}

/** Bench's default for `module`, as a copy would read it. */
export const defaultText = (module: ModuleId) => portable(DEFAULT_SOURCES[module]);

/** Removes a project's own source: its parts go back to the base. */
export async function removeSource(store: FileStore, file: string): Promise<void> {
  await store.remove(file);
}
