/**
 * The code each part's tests run against: Bench's default always, and yours, the file you write in the part's lesson,
 * loaded the same way the board loads it. Your file is the one in your home folder (Settings in Bench, kept in
 * bench.local.json) once there is one there, or the lesson's file in this repo until then.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS, loadModule, type Code, type ModuleId } from '../src/index';

/** The parts you write in lessons, and their files in this repo. */
export const LESSON_FILES = {
  led: 'lesson-1-light-an-led/led.ts',
  switch: 'lesson-2-switches/switch.ts',
  potentiometer: 'lesson-3-knob/potentiometer.ts',
  capacitor: 'lesson-4-capacitors/capacitor.ts',
  transistor: 'lesson-5-transistors/transistor.ts',
  gpio: 'lesson-6-microcontroller/gpio.ts',
} as const satisfies Partial<Record<ModuleId, string>>;

export type LessonModule = keyof typeof LESSON_FILES;

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Your home folder, from bench.local.json, if one is set. */
export function homeFolder(): string | undefined {
  const config = join(REPO, 'bench.local.json');
  if (!existsSync(config)) return undefined;
  const { home } = JSON.parse(readFileSync(config, 'utf8')) as { home?: unknown };
  return typeof home === 'string' && home !== '' ? home : undefined;
}

/** The file with your code for `id`: in your home folder, or the lesson's file in this repo. */
export function yourFile(id: LessonModule): string | undefined {
  const home = homeFolder();
  const mine = home === undefined ? undefined : join(home, 'lessons', `${id}.ts`);
  if (mine !== undefined && existsSync(mine)) return mine;
  const repo = join(REPO, 'packages/engine/src', LESSON_FILES[id]);
  return existsSync(repo) ? repo : undefined;
}

export interface Implementation<K extends ModuleId> {
  /** What the tests call it. */
  readonly label: string;
  readonly code: Code[K];
  /** Bench's own: always written, so its tests never wait. */
  readonly isDefault: boolean;
}

/** Bench's default for `id`, then yours. */
export function implementations<K extends LessonModule>(id: K): Implementation<K>[] {
  const list: Implementation<K>[] = [{ label: 'Bench’s default', code: DEFAULTS[id], isDefault: true }];
  const file = yourFile(id);
  if (file !== undefined) list.push({ label: 'yours', code: loadModule(id, { text: readFileSync(file, 'utf8'), file }, DEFAULTS), isDefault: false });
  return list;
}
