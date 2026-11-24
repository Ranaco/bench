/**
 * A board's code, ready to run: the files it might use read from your home folder, each new version trial-run, and
 * which code each part runs worked out (see resolve.ts). Edits outside Bench (your editor) come in as they're saved.
 */
import { DEFAULTS, type ModuleId, type ModuleSource } from '@bench/engine';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FileStore } from '../files/store';
import { isFinished } from '../lessons/progress';
import { lessonById } from '../lessons/lessons';
import { STARTER_PROGRAM } from '../projects/projects';
import type { CodeFor } from '../sim';
import { base, build, chooseAll, customSources, NO_FILES, type Chosen, type CodeFiles, type CodeScope } from './resolve';
import { LESSON_MODULES, LESSON_PROGRAM_FILE, lessonFile, PROGRAM_STUB, type LessonModule } from './sources';
import { trialAll } from './trial';

export interface BoardCode {
  readonly store: FileStore;
  readonly scope: CodeScope;
  readonly codeFor: CodeFor;
  readonly programFor: (id: string) => ModuleSource;
  /** Which code the parts run for `module`, and where it's from. */
  readonly chosen: (module: ModuleId) => Chosen;
  /** What `module` runs without a project's own source: the same everywhere. */
  readonly base: (module: ModuleId) => Chosen;
  /** What's wrong with the code the parts run for `module`, if anything. */
  readonly problem: (module: ModuleId) => string | undefined;
  /** Custom code is paused: Bench stopped while running it last time. */
  readonly paused: boolean;
  /** Runs custom code again after a pause. */
  readonly unpause: () => void;
  /** Reads the files again: after Bench itself saves one. */
  readonly reload: () => void;
  /** Gives copied ESP32s (new id by original's) the original's program, then reads the files again. */
  readonly copyFiles: (renamed: ReadonlyMap<string, string>) => void;
}

/** Where a board's programs are kept, by the chip's part id. */
export function programsDir(scope: CodeScope): string {
  return scope.project ? `projects/${scope.project.slug}/programs` : `lessons/${scope.lesson ?? 'free'}/programs`;
}

/**
 * Copies each original chip's program to its copy. An original that isn't on this board (pasted from another) has
 * none here, so its copy starts like any new chip.
 */
async function copyPrograms(store: FileStore, scope: CodeScope, renamed: ReadonlyMap<string, string>): Promise<void> {
  const programs = programsDir(scope);
  for (const [from, to] of renamed) {
    const program = await store.read(`${programs}/${from}.ts`);
    if (program !== undefined) await store.write(`${programs}/${to}.ts`, program);
  }
}

/** Set while custom code runs for the first few seconds of a page: still set at the next load means it froze. */
const SAFE_START = 'bench.safeStart';
/** How long custom code has to run before it counts as fine. */
const SAFE_AFTER_MS = 3000;

const finished = (lesson: string) => {
  const found = lessonById(lesson);
  return found !== undefined && isFinished(found);
};

interface Read {
  readonly files: CodeFiles;
  readonly programs: ReadonlyMap<string, string>;
  /** Your Lesson 6 program from before each chip had its own. */
  readonly legacyProgram: string | undefined;
  readonly refused: ReadonlyMap<string, string>;
}

async function readAll(store: FileStore, scope: CodeScope): Promise<Read> {
  const lessons = new Map<LessonModule, string>();
  for (const m of Object.keys(LESSON_MODULES) as LessonModule[]) {
    const text = await store.read(lessonFile(m));
    if (text !== undefined) lessons.set(m, text);
  }
  const project = new Map<ModuleId, string>();
  if (scope.project) {
    const dir = `projects/${scope.project.slug}/parts`;
    for (const entry of await store.list(dir)) {
      if (entry.dir || !entry.name.endsWith('.ts')) continue;
      const text = await store.read(`${dir}/${entry.name}`);
      if (text !== undefined) project.set(entry.name.slice(0, -3) as ModuleId, text);
    }
  }
  const programs = new Map<string, string>();
  for (const entry of await store.list(programsDir(scope))) {
    if (entry.dir || !entry.name.endsWith('.ts')) continue;
    const text = await store.read(`${programsDir(scope)}/${entry.name}`);
    if (text !== undefined) programs.set(entry.name.slice(0, -3), text);
  }
  const files: CodeFiles = { lessons, project };
  const refused = await trialAll(customSources(scope, files, finished));
  const legacyProgram = scope.lesson === 'microcontroller' ? await store.read(LESSON_PROGRAM_FILE) : undefined;
  return { files, programs, legacyProgram, refused };
}

/** The board's code for `scope`, from `store`; undefined until it's been read. */
export function useBoardCode(store: FileStore | undefined, scope: CodeScope | undefined): BoardCode | undefined {
  const [read, setRead] = useState<Read | undefined>(undefined);
  const [paused, setPaused] = useState(() => {
    try {
      return window.sessionStorage.getItem(SAFE_START) !== null;
    } catch {
      return false;
    }
  });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!store || !scope) return;
    const mounted = { live: true };
    void readAll(store, scope).then((found) => {
      if (mounted.live) setRead(found);
    });
    return () => {
      mounted.live = false;
    };
  }, [store, scope, version]);

  // Saved outside Bench: read again.
  useEffect(() => {
    if (!store || !scope) return;
    return store.onChange((path) => {
      if (path.startsWith('lessons/') || (scope.project && path.startsWith(`projects/${scope.project.slug}/`))) reload();
    });
  }, [store, scope, reload]);

  // Custom code that keeps running for a few seconds is fine: no need to pause it next time.
  const runsCustom = read !== undefined && !paused && (read.files.lessons.size > 0 || read.files.project.size > 0);
  useEffect(() => {
    if (!runsCustom) return;
    try {
      window.sessionStorage.setItem(SAFE_START, String(Date.now()));
    } catch {
      return;
    }
    const clear = () => {
      try {
        window.sessionStorage.removeItem(SAFE_START);
      } catch {
        // Nothing kept, nothing to clear.
      }
    };
    const timer = window.setTimeout(clear, SAFE_AFTER_MS);
    // Leaving normally (another screen, a reload, closing the tab) isn't a freeze: only a page that stops answering
    // never gets to clear it.
    window.addEventListener('pagehide', clear);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pagehide', clear);
      clear();
    };
  }, [runsCustom]);

  return useMemo(() => {
    if (!store || !scope || !read) return undefined;
    const { files, programs, legacyProgram, refused } = paused ? { ...read, files: NO_FILES } : read;
    const chosen = chooseAll(scope, files, finished);
    const built = build(chosen, refused);
    const codeFor: CodeFor = () => (paused ? DEFAULTS : built.code);
    const programFor = (id: string): ModuleSource => {
      const own = programs.get(id);
      const file = `${programsDir(scope)}/${id}.ts`;
      if (own !== undefined) return { text: own, file };
      if (scope.lesson === 'microcontroller') return { text: legacyProgram ?? PROGRAM_STUB, file };
      return { text: scope.project ? STARTER_PROGRAM : PROGRAM_STUB, file };
    };
    return {
      store,
      scope,
      codeFor,
      programFor,
      chosen: (module) => chosen[module],
      base: (module) => base(module, scope, files, finished),
      problem: (module) => built.errors.get(module)?.message,
      paused,
      unpause: () => {
        setPaused(false);
      },
      reload,
      copyFiles: (renamed) => {
        void copyPrograms(store, scope, renamed).then(reload);
      },
    };
  }, [store, scope, read, paused, reload]);
}
