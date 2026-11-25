/**
 * Which code the parts on a board run. For each module, the first of these that's there:
 *
 *   1. the project's own source for it   projects/<project>/parts/<module>.ts, from "Edit source"
 *   2. the base:
 *      - in a project (Build): Bench's default, always. Every part there is written, whether or not you've done the
 *        lesson that teaches it.
 *      - in a lesson: your lesson code while the lesson that introduces it isn't finished (and always in that
 *        lesson): lessons/<module>.ts, which starts as the lesson's empty stub; Bench's default after that
 *
 * The base is the same in every project: changing it for all of them is changing it in the code.
 */
import { buildCode, CodeError, DEFAULTS, MODULES, type Code, type ModuleId, type ModuleSource } from '@bench/engine';
import { isLessonModule, lessonFile, LESSON_MODULES, STUB_SOURCES, type LessonModule } from './sources';

/** Where a module's code came from, for the Inspector and the Code window to say. */
export type Origin = 'default' | 'lesson' | 'project';

/** The code files a board might use, read from your home folder. */
export interface CodeFiles {
  /** Your lesson code, by module. */
  readonly lessons: ReadonlyMap<LessonModule, string>;
  /** The project's own source, by module. */
  readonly project: ReadonlyMap<ModuleId, string>;
}

export const NO_FILES: CodeFiles = { lessons: new Map(), project: new Map() };

/** What a board is: a project, or a lesson being played. */
export interface CodeScope {
  readonly project?: { readonly slug: string };
  /** The id of the lesson being played: its own part always runs your code. */
  readonly lesson?: string;
}

/** A module's code: its text (undefined for Bench's default, which is built in), and where it's from. */
export interface Chosen {
  readonly origin: Origin;
  readonly source: ModuleSource | undefined;
}

/** Where a project keeps its own source for `module`. */
export const projectCodeFile = (slug: string, module: ModuleId) => `projects/${slug}/parts/${module}.ts`;

/** Which code the parts run for `module`, and why. */
export function choose(module: ModuleId, scope: CodeScope, files: CodeFiles, finished: (lesson: string) => boolean): Chosen {
  const own = scope.project && files.project.get(module);
  if (scope.project && own !== undefined) return { origin: 'project', source: { text: own, file: projectCodeFile(scope.project.slug, module) } };
  return base(module, scope, files, finished);
}

/** What `module` runs without a project's own source for it: Bench's default in every project. */
export function base(module: ModuleId, scope: CodeScope, files: CodeFiles, finished: (lesson: string) => boolean): Chosen {
  if (!scope.project && isLessonModule(module)) {
    const lesson = LESSON_MODULES[module];
    if (scope.lesson === lesson || !finished(lesson)) return lessonSource(module, files);
  }
  return { origin: 'default', source: undefined };
}

function lessonSource(module: LessonModule, files: CodeFiles): Chosen {
  return { origin: 'lesson', source: { text: files.lessons.get(module) ?? STUB_SOURCES[module], file: lessonFile(module) } };
}

/** A part whose code can't run (it doesn't parse, say): building one says why, naming the file and line. */
function broken(error: unknown): unknown {
  const at = error instanceof CodeError && error.line !== undefined ? ` (line ${String(error.line)})` : '';
  const reason = error instanceof CodeError ? new Error(`${error.file}${at}: ${error.message}`) : error;
  return function Broken() {
    throw reason;
  };
}

/** A set of code, and what went wrong building it. */
export interface Built {
  readonly code: Code;
  readonly errors: ReadonlyMap<ModuleId, Error>;
}

const builds = new Map<string, Built>();

/**
 * Builds a full set of code from the chosen sources, one module at a time, so one that doesn't parse breaks only the
 * parts that run it. Built once for each distinct set of sources.
 */
export function build(chosen: Readonly<Record<ModuleId, Chosen>>, refused: ReadonlyMap<string, string> = new Map()): Built {
  const key = MODULES.map((m) => `${m}:${chosen[m].source?.file ?? ''}:${chosen[m].source?.text ?? ''}`).join('\u0000');
  const known = builds.get(key);
  if (known) return known;
  const errors = new Map<ModuleId, Error>();
  const usable = new Map<ModuleId, ModuleSource>();
  for (const m of MODULES) {
    const source = chosen[m].source;
    if (!source) continue;
    const reason = refused.get(source.text);
    if (reason !== undefined) {
      errors.set(m, new Error(`${source.file}: ${reason}`));
      continue;
    }
    // Each one alone first, so a mistake in one doesn't stop the others.
    try {
      buildCode({ [m]: source }, DEFAULTS);
      usable.set(m, source);
    } catch (error) {
      errors.set(m, error instanceof Error ? error : new Error(String(error)));
    }
  }
  const sources = Object.fromEntries(usable) as Partial<Record<ModuleId, ModuleSource>>;
  let code: Code;
  try {
    code = buildCode(sources, DEFAULTS);
  } catch (error) {
    code = DEFAULTS;
    for (const m of MODULES) if (sources[m]) errors.set(m, error instanceof Error ? error : new Error(String(error)));
  }
  if (errors.size > 0) {
    const patched: Record<string, unknown> = { ...code };
    for (const [m, error] of errors) patched[m] = broken(error);
    code = patched as unknown as Code;
  }
  const built = { code, errors };
  builds.set(key, built);
  return built;
}

/** Every module's choice. */
export function chooseAll(scope: CodeScope, files: CodeFiles, finished: (lesson: string) => boolean): Record<ModuleId, Chosen> {
  return Object.fromEntries(MODULES.map((m) => [m, choose(m, scope, files, finished)])) as Record<ModuleId, Chosen>;
}

/** The custom sources a board would run, each once: what has to pass a trial run before it goes live. */
export function customSources(scope: CodeScope, files: CodeFiles, finished: (lesson: string) => boolean): { module: ModuleId; source: ModuleSource }[] {
  const seen = new Map<string, { module: ModuleId; source: ModuleSource }>();
  for (const [module, chosen] of Object.entries(chooseAll(scope, files, finished)) as [ModuleId, Chosen][]) {
    if (chosen.source) seen.set(chosen.source.text, { module, source: chosen.source });
  }
  return [...seen.values()];
}
