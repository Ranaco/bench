import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Board } from './builder/board';
import { storedBoard, type SessionSource } from './builder/session';
import { CodeContext } from './code/context';
import { useBoardCode, type BoardCode } from './code/useBoardCode';
import { TopNav } from './components/TopNav';
import { openStore, type FileStore } from './files/store';
import { Home } from './home/Home';
import { LessonSelect } from './home/LessonSelect';
import { ProjectSelect } from './home/ProjectSelect';
import { Settings } from './home/Settings';
import { NAME_LENGTH, readProject, renameProject, saveBoard, type ProjectMeta } from './projects/projects';
import type { Lesson } from './lessons/lessons';
import { HREF, useScreen } from './routes';
import { Workspace } from './workspace/Workspace';

export function App() {
  const screen = useScreen();
  switch (screen.kind) {
    case 'home':
      return <Home />;
    case 'lessons':
      return <LessonSelect />;
    case 'lesson': {
      const { lesson } = screen;
      const nav = (
        <TopNav
          trail={[
            { label: 'Bench', href: HREF.home },
            { label: 'Lessons', href: HREF.lessons },
            { label: `${String(lesson.number)} · ${lesson.title}` },
          ]}
        />
      );
      // Keyed: each lesson has its own board, history and progress.
      return <LessonBoard key={lesson.id} lesson={lesson} nav={nav} />;
    }
    case 'boards':
      return <ProjectSelect />;
    case 'settings':
      return <Settings />;
    case 'build':
      // Keyed: each project has its own history.
      return <Project key={screen.id} slug={screen.id} />;
  }
}

/** A lesson's board: kept in this browser, its parts running your lesson code (see code/resolve.ts). */
function LessonBoard({ lesson, nav }: { readonly lesson: Lesson; readonly nav: ReactNode }) {
  const [store, setStore] = useState<FileStore | undefined>(undefined);
  useEffect(() => {
    void openStore().then(setStore);
  }, []);
  const scope = useMemo(() => ({ lesson: lesson.id }), [lesson.id]);
  const code = useBoardCode(store, scope);
  const stored = useMemo(() => storedBoard(`bench.lesson.${lesson.id}.board`), [lesson.id]);
  if (!code) return null;
  return (
    <CodeContext value={code}>
      <Paused code={code} />
      <Workspace lesson={lesson} source={{ ...stored, codeFor: code.codeFor, programFor: code.programFor, copied: code.copyFiles }} nav={nav} />
    </CodeContext>
  );
}

/** Says when your code is paused, because Bench stopped while running it last time; and runs it again. */
function Paused({ code }: { readonly code: BoardCode }) {
  if (!code.paused) return null;
  return (
    <div className="paused-bar" role="status">
      <p>Bench stopped while running your code last time, so it’s paused: every part runs Bench’s default for now.</p>
      <button type="button" className="ghost" onClick={code.unpause}>
        Run my code again
      </button>
    </div>
  );
}

/** What a project holds, read before its board opens. */
interface Opened {
  readonly store: FileStore;
  readonly meta: ProjectMeta;
  readonly board: Board;
}

/** Reads a project: its name and settings, and its board. Its code is read with the rest of its code (useBoardCode). */
async function open(slug: string): Promise<Opened | undefined> {
  const store = await openStore();
  const project = await readProject(store, slug);
  return project && { store, ...project };
}

/** One of Build's projects, its name in the header (click it to rename). One that isn't there goes back to the list. */
function Project({ slug }: { readonly slug: string }) {
  const [opened, setOpened] = useState<Opened | undefined | 'missing'>(undefined);
  const [name, setName] = useState<string | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void open(slug).then((found) => {
      if (!live) return;
      setOpened(found ?? 'missing');
      setName(found?.meta.name);
    });
    return () => {
      live = false;
    };
  }, [slug]);

  useEffect(() => {
    if (opened === 'missing') window.location.replace(HREF.boards);
  }, [opened]);

  if (opened === undefined || opened === 'missing' || name === undefined) return null;
  const nav = (
    <TopNav
      trail={[
        { label: 'Bench', href: HREF.home },
        { label: 'Build', href: HREF.boards },
        {
          label: name,
          maxLength: NAME_LENGTH,
          onRename: (next) => {
            const trimmed = next.trim().slice(0, NAME_LENGTH);
            if (trimmed === '') return;
            setName(trimmed);
            void renameProject(opened.store, slug, trimmed);
          },
        },
      ]}
    />
  );
  return <ProjectWorkspace slug={slug} opened={opened} nav={nav} />;
}

/** How long a board waits, after a change, before it's written to disk: a drag is many changes. */
const SAVE_AFTER_MS = 300;

/**
 * Saves a project's board a moment after it stops changing (a drag is many changes), and at once when asked: on
 * leaving the project. The first board it's given is the board as it was opened: nothing to write.
 */
function boardSaver(store: FileStore, slug: string, opened: Board): Pick<SessionSource, 'load' | 'save'> & { flush: () => void } {
  let pending: { board: Board; timer: number } | undefined;
  let opening = true;
  const flush = () => {
    if (!pending) return;
    window.clearTimeout(pending.timer);
    const { board } = pending;
    pending = undefined;
    void saveBoard(store, slug, board);
  };
  return {
    load: () => opened,
    save: (board) => {
      if (opening) {
        opening = false;
        return;
      }
      if (pending) window.clearTimeout(pending.timer);
      pending = { board, timer: window.setTimeout(flush, SAVE_AFTER_MS) };
    },
    flush,
  };
}

function ProjectWorkspace({ slug, opened, nav }: { readonly slug: string; readonly opened: Opened; readonly nav: ReactNode }) {
  const [saver] = useState(() => boardSaver(opened.store, slug, opened.board));
  useEffect(() => saver.flush, [saver]);

  const scope = useMemo(() => ({ project: { slug } }), [slug]);
  const code = useBoardCode(opened.store, scope);
  const running = useMemo(
    () => (code ? { load: saver.load, save: saver.save, codeFor: code.codeFor, programFor: code.programFor, copied: code.copyFiles } : undefined),
    [code, saver],
  );
  if (!code || !running) return null;
  return (
    <CodeContext value={code}>
      <Paused code={code} />
      <Workspace lesson={undefined} source={running} nav={nav} />
    </CodeContext>
  );
}
