import type { DockviewApi } from 'dockview-react';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { PALETTE } from '../builder/catalog';
import { SessionContext, useSessionState } from '../builder/session';
import type { Lesson } from '../lessons/lessons';
import { LessonContext, useLessonProgress } from '../lessons/progress';
import { Dock } from './Dock';
import { openWindow, type Mode, type WindowId } from './layout';
import { ShowWindowContext } from './show';
import { WindowsMenu } from './WindowsMenu';
import { BoardWindow, GraphWindow, InspectorWindow, LessonWindow, MeterWindow, PartsWindow, SpecWindow, View3dWindow } from './windows';

/** Below this width the windows stack in one scrolling column instead of docking. */
const NARROW = '(max-width: 900px)';

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (changed) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', changed);
      return () => {
        list.removeEventListener('change', changed);
      };
    },
    () => window.matchMedia(query).matches,
  );
}

/**
 * A lesson's workspace, or Build's: a board session (and the lesson being
 * played) shared by every window, the header's board actions, and the dock.
 */
export function Workspace({ lesson, nav }: { readonly lesson: Lesson | undefined; readonly nav: ReactNode }) {
  const mode: Mode = lesson ? 'lessons' : 'build';
  const session = useSessionState(lesson ? `bench.lesson.${lesson.id}.board` : 'bench.board', lesson?.parts ?? PALETTE);
  const progress = useLessonProgress(lesson, session.sim, session.board, session.meter);
  const narrow = useMediaQuery(NARROW);
  const [api, setApi] = useState<DockviewApi | undefined>(undefined);
  // The stacked layout closes the dock: forget its controls, so going wide again waits for the new dock's.
  if (narrow && api) setApi(undefined);
  const showWindow = (id: WindowId) => {
    if (api) openWindow(api, id);
    else document.getElementById(`stack-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <SessionContext value={session}>
      <LessonContext value={progress}>
        <ShowWindowContext value={showWindow}>
          <div className="app">
            <header>
              {nav}
              <div className="header-actions">
                <button type="button" className="ghost" disabled={!session.canUndo} onClick={session.undo} title="Undo (Ctrl+Z)">
                  Undo
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={!session.canRedo}
                  onClick={session.redo}
                  title="Redo (Ctrl+Shift+Z)"
                >
                  Redo
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={session.board.parts.length === 0}
                  onClick={session.clear}
                  title="Clear the board (undo brings it back)"
                >
                  Clear
                </button>
                {!narrow && api && <WindowsMenu api={api} mode={mode} />}
              </div>
            </header>
            {narrow ? <Stacked mode={mode} /> : <Dock mode={mode} onApi={setApi} />}
          </div>
        </ShowWindowContext>
      </LessonContext>
    </SessionContext>
  );
}

/**
 * The 3D view on a phone: closed until you open it, so the page doesn't load three.js for nothing, and a swipe
 * down the page isn't caught by a second big area that turns every touch into a camera move.
 */
function Stacked3d() {
  const [open, setOpen] = useState(false);
  return (
    <section id="stack-view3d" className={`stack-card${open ? ' stack-3d' : ''}`} aria-label="3D view">
      <div className="stack-3d-head">
        <h2>3D view</h2>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? 'Close it' : 'Open it'}
        </button>
      </div>
      {open ? <View3dWindow /> : <p className="stack-3d-note">The knob as the real part: turn it, take it apart, look at every piece.</p>}
    </section>
  );
}

/** Phones and narrow windows: every window in one column, the page scrolling as usual. */
function Stacked({ mode }: { readonly mode: Mode }) {
  return (
    <main className="stacked">
      {mode === 'lessons' && (
        <section className="stack-card" aria-label="Lesson">
          <LessonWindow />
        </section>
      )}
      <section className="stack-board" aria-label="Board">
        <BoardWindow />
      </section>
      <Stacked3d />
      {(
        [
          ['parts', 'Parts', PartsWindow],
          ['meter', 'Meter', MeterWindow],
          ['inspector', 'Inspector', InspectorWindow],
          ['spec', 'Spec sheet', SpecWindow],
          ['graph', 'Graph', GraphWindow],
        ] as const
      ).map(([id, title, Window]) => (
        <section key={id} id={`stack-${id}`} className="stack-card" aria-label={title}>
          <h2>{title}</h2>
          <Window />
        </section>
      ))}
    </main>
  );
}
