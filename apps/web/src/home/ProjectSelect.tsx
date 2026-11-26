import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { openStore, type FileStore } from '../files/store';
import { ago } from '../format';
import { SHARED_PROGRAM } from '../program/source';
import {
  bringOverBrowserBoards,
  createProject,
  deleteProject,
  duplicateProject,
  listProjects,
  NAME_LENGTH,
  renameProject,
  type ProjectSummary,
} from '../projects/projects';
import { HREF } from '../routes';
import { useRoving } from './roving';

/** The time now, for "changed 5 min ago". */
const clock = () => Date.now();

const partsText = (n: number) => (n === 0 ? 'Empty' : `${String(n)} part${n === 1 ? '' : 's'}`);

/**
 * Build's projects, like a game's save slots: start a new one, or carry on with one. Each is a folder in your home
 * folder, saved as you build; rename, copy or delete it here. Esc goes back to the menu.
 */
export function ProjectSelect() {
  const [store, setStore] = useState<FileStore | undefined>(undefined);
  const [projects, setProjects] = useState<ProjectSummary[] | undefined>(undefined);
  const [now, setNow] = useState(clock);
  const [renaming, setRenaming] = useState<string | undefined>(undefined);
  const [deleting, setDeleting] = useState<string | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  // "New project" first, then each project.
  const roving = useRoving((projects?.length ?? 0) + 1);
  const first = useRef<HTMLAnchorElement>(null);

  const refresh = async (on: FileStore) => {
    setProjects(await listProjects(on));
    setNow(clock());
  };
  const act = (work: (on: FileStore) => Promise<unknown>) => {
    if (!store) return;
    work(store)
      .then(() => refresh(store))
      .catch((error: unknown) => {
        setProblem(error instanceof Error ? error.message : String(error));
      });
  };

  useEffect(() => {
    const mounted = { live: true };
    void (async () => {
      const opened = await openStore();
      // Boards an older Bench kept in this browser come over as projects, once.
      await bringOverBrowserBoards(opened, window.localStorage, opened.kind === 'disk' ? await opened.read('lessons/program.ts') : SHARED_PROGRAM.text);
      if (!mounted.live) return;
      setStore(opened);
      await refresh(opened);
    })().catch((error: unknown) => {
      setProblem(error instanceof Error ? error.message : String(error));
    });
    return () => {
      mounted.live = false;
    };
  }, []);

  useEffect(() => {
    if (projects) first.current?.focus();
  }, [projects]);

  useEffect(() => {
    const back = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !(event.target instanceof HTMLInputElement)) window.location.hash = HREF.home;
    };
    window.addEventListener('keydown', back);
    return () => {
      window.removeEventListener('keydown', back);
    };
  }, []);

  const newProps = roving.item(0);
  const startNew = () => {
    if (!store) return;
    createProject(store)
      .then((slug) => {
        window.location.hash = HREF.board(slug);
      })
      .catch((error: unknown) => {
        setProblem(error instanceof Error ? error.message : String(error));
      });
  };

  return (
    <main className="home">
      <div className="home-inner wide">
        <a className="back" href={HREF.home}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3.5L5.5 8l4.5 4.5" />
          </svg>
          Menu
        </a>
        <h1 className="screen-title">Build</h1>
        {problem !== undefined && <p className="warning">{problem}</p>}

        <ol className="lesson-list" onKeyDown={roving.onKeyDown} aria-busy={projects === undefined}>
          <li style={{ '--i': 0 } as CSSProperties}>
            <a
              href={HREF.boards}
              className="lesson-card board-new"
              {...newProps}
              ref={(element) => {
                newProps.ref(element);
                first.current = element;
              }}
              onClick={(event) => {
                event.preventDefault();
                startNew();
              }}
            >
              <span className="lesson-number" aria-hidden="true">
                <svg viewBox="0 0 16 16">
                  <path d="M8 3.5v9M3.5 8h9" />
                </svg>
              </span>
              <span className="lesson-card-title">New project</span>
              <span className="lesson-card-goal">Every part so far, and nothing on it yet</span>
            </a>
          </li>
          {(projects ?? []).map((project, i) => {
            const props = roving.item(i + 1);
            return (
              <li key={project.slug} className="board-row" style={{ '--i': i + 1 } as CSSProperties}>
                {renaming === project.slug ? (
                  <form
                    className="lesson-card board-rename"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const name = new FormData(event.currentTarget).get('name');
                      setRenaming(undefined);
                      if (typeof name === 'string') act((on) => renameProject(on, project.slug, name));
                    }}
                  >
                    <input
                      name="name"
                      aria-label={`New name for ${project.name}`}
                      defaultValue={project.name}
                      maxLength={NAME_LENGTH}
                      autoFocus
                      onFocus={(event) => {
                        event.currentTarget.select();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setRenaming(undefined);
                      }}
                    />
                    <button type="submit" className="ghost">
                      Save
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setRenaming(undefined);
                      }}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <a href={HREF.board(project.slug)} className="lesson-card" {...props}>
                    <span className="lesson-number board-mark" aria-hidden="true">
                      {project.name.trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="lesson-card-title">{project.name}</span>
                    <span className="lesson-card-goal">{`${partsText(project.parts)} · changed ${ago(project.edited, now)}`}</span>
                  </a>
                )}
                {renaming !== project.slug && (
                  <div className="board-actions">
                    {deleting === project.slug ? (
                      <>
                        <span className="board-confirm">Delete it for good?</span>
                        <button
                          type="button"
                          className="ghost danger"
                          onClick={() => {
                            setDeleting(undefined);
                            act((on) => deleteProject(on, project.slug));
                          }}
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          autoFocus
                          onClick={() => {
                            setDeleting(undefined);
                          }}
                        >
                          Keep it
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            setRenaming(project.slug);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            act((on) => duplicateProject(on, project.slug));
                          }}
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            setDeleting(project.slug);
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <p className="home-hint">
          {store?.kind === 'disk'
            ? `Each project is a folder in ${store.home ?? 'your home folder'}/projects, saved as you build.`
            : 'Each project is kept in this browser, saved as you build. On your computer, Bench keeps them as folders in your home folder.'}{' '}
          <a href={HREF.settings}>Settings</a>
        </p>
      </div>
    </main>
  );
}
