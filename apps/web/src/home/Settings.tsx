import { useEffect, useState } from 'react';
import { homeStatus, setHome, type HomeStatus } from '../files/store';
import { setVimKeys, vimKeys } from '../code/prefs';
import { HREF } from '../routes';

/** A folder beside Bench's own repo, for someone choosing for the first time. */
const suggestion = (repo: string) => `${repo.replace(/\/[^/]*$/, '')}/bench-home`;

/**
 * Settings: where your own work lives. Your home folder holds the part code you write in lessons and a folder for
 * each project; it's yours, outside Bench's repo, so you can keep it in a git repo of its own.
 */
export function Settings() {
  const [status, setStatus] = useState<HomeStatus | undefined | 'none'>(undefined);
  const [path, setPath] = useState('');
  const [message, setMessage] = useState<{ readonly kind: 'ok' | 'problem'; readonly text: string } | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [vim, setVim] = useState(vimKeys);

  useEffect(() => {
    void homeStatus().then((found) => {
      setStatus(found ?? 'none');
      if (found) setPath(found.home ?? suggestion(found.repo));
    });
    const back = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !(event.target instanceof HTMLInputElement)) window.location.hash = HREF.home;
    };
    window.addEventListener('keydown', back);
    return () => {
      window.removeEventListener('keydown', back);
    };
  }, []);

  const choose = (create: boolean) => {
    setBusy(true);
    setMessage(undefined);
    setHome(path.trim(), create)
      .then((home) => {
        setStatus((s) => (s && s !== 'none' ? { ...s, home, exists: true } : s));
        setPath(home);
        setMessage({ kind: 'ok', text: 'Saved. Bench keeps your lesson code and your projects there from now on.' });
      })
      .catch((error: unknown) => {
        const text = error instanceof Error ? error.message : String(error);
        setMessage({ kind: 'problem', text });
      })
      .finally(() => {
        setBusy(false);
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
        <h1 className="screen-title">Settings</h1>

        <section className="settings-card" aria-labelledby="home-title">
          <h2 id="home-title">Your home folder</h2>
          {status === undefined && <p className="settings-note">Looking…</p>}
          {status === 'none' && (
            <p className="settings-note">
              This copy of Bench has no dev server behind it (it’s a build, like the one on your phone), so your work is
              kept in this browser. On your computer, run Bench with <code>pnpm dev</code> to keep it as files.
            </p>
          )}
          {status !== undefined && status !== 'none' && (
            <>
              <p className="settings-note">
                The part code you write in lessons, and a folder for each project. It’s yours: outside Bench’s repo, so
                you can make it a git repo of its own (<code>git init</code> in it).
              </p>
              <form
                className="settings-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  choose(false);
                }}
              >
                <input
                  aria-label="Home folder"
                  value={path}
                  spellCheck={false}
                  onChange={(event) => {
                    setPath(event.currentTarget.value);
                  }}
                />
                <button type="submit" className="ghost" disabled={busy || path.trim() === ''}>
                  Use it
                </button>
              </form>
              {status.home !== undefined && <p className="settings-note">{`Now: ${status.home}`}</p>}
              {message?.kind === 'problem' && message.text.startsWith('There’s no folder there') ? (
                <div className="notice-row">
                  <p>{`There’s no folder at ${path} yet.`}</p>
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    onClick={() => {
                      choose(true);
                    }}
                  >
                    Make it
                  </button>
                </div>
              ) : (
                message && <p className={message.kind === 'ok' ? 'settings-note' : 'warning'}>{message.text}</p>
              )}
            </>
          )}
        </section>

        <section className="settings-card" aria-labelledby="editor-title">
          <h2 id="editor-title">The code editor</h2>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={vim}
              onChange={(event) => {
                setVimKeys(event.currentTarget.checked);
                setVim(event.currentTarget.checked);
              }}
            />
            <span>
              Vim keys
              <span className="settings-note">Normal, insert and visual modes, as in Vim and Neovim. Ctrl+S still saves.</span>
            </span>
          </label>
        </section>
      </div>
    </main>
  );
}
