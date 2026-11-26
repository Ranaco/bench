/**
 * Where your own work is kept: your home folder on disk, through Bench's dev server (see apps/web/server/files.ts),
 * or this browser's storage when there's no dev server (a build served to your phone). Paths are relative to the
 * home folder, with forward slashes: "projects/dimmer/board.json".
 */
import BUNDLED_LESSONS from 'virtual:bench-lessons';

export interface Entry {
  readonly name: string;
  readonly dir: boolean;
}

export interface FileStore {
  /** Disk: real files in your home folder. Browser: kept in this browser only. */
  readonly kind: 'disk' | 'browser';
  /** The home folder's path, on disk. */
  readonly home: string | undefined;
  read(path: string): Promise<string | undefined>;
  write(path: string, text: string): Promise<void>;
  remove(path: string): Promise<void>;
  list(dir: string): Promise<readonly Entry[]>;
  /** A project's whole folder: gone, or copied. */
  removeDir(path: string): Promise<void>;
  copyDir(from: string, to: string): Promise<void>;
  /** Called when a file changes outside Bench (your editor), with its path. */
  onChange(listener: (path: string) => void): () => void;
}

/** What the dev server says about the home folder: set or not, and whether it's there. */
export interface HomeStatus {
  readonly home: string | undefined;
  readonly exists: boolean;
  /** Bench's own repo, so Settings can suggest a folder beside it. */
  readonly repo: string;
}

class Failed extends Error {}

export { BUNDLED_LESSONS };

async function call(route: string, init: RequestInit = {}, query: Record<string, string> = {}): Promise<Response> {
  const url = `/__bench/${route}?${new URLSearchParams(query).toString()}`;
  const headers = new Headers(init.headers);
  headers.set('X-Bench', '1');
  const response = await fetch(url, { ...init, headers });
  if (!response.ok && response.status !== 404) {
    const { error } = (await response.json().catch(() => ({ error: response.statusText }))) as { error?: string };
    throw new Failed(error ?? response.statusText);
  }
  return response;
}

/** The dev server's view of the home folder, or undefined when there's no dev server (the phone build). */
export async function homeStatus(): Promise<HomeStatus | undefined> {
  try {
    const response = await call('home');
    if (!response.ok) return undefined;
    const type = response.headers.get('Content-Type') ?? '';
    if (!type.includes('application/json')) return undefined; // a built page answers everything with its HTML
    return (await response.json()) as HomeStatus;
  } catch {
    return undefined;
  }
}

/** Sets the home folder: a full path; `create` makes it if it isn't there. Throws with the reason if it can't. */
export async function setHome(home: string, create: boolean): Promise<string> {
  const response = await call('home', { method: 'PUT', body: JSON.stringify({ home, create }) });
  const result = (await response.json()) as { home?: string; error?: string };
  if (!response.ok || result.home === undefined) throw new Failed(result.error ?? 'There’s no folder there.');
  return result.home;
}

class DiskStore implements FileStore {
  readonly kind = 'disk';
  constructor(readonly home: string) {}

  async read(path: string): Promise<string | undefined> {
    const response = await call('file', {}, { path });
    if (response.status === 404) return undefined;
    const found = (await response.json()) as { text?: string; missing?: boolean };
    return found.missing === true ? undefined : found.text;
  }

  async write(path: string, text: string): Promise<void> {
    await call('file', { method: 'PUT', body: text }, { path });
  }

  async remove(path: string): Promise<void> {
    await call('file', { method: 'DELETE' }, { path });
  }

  async list(dir: string): Promise<readonly Entry[]> {
    const response = await call('list', {}, { path: dir });
    return ((await response.json()) as { entries: Entry[] }).entries;
  }

  async removeDir(path: string): Promise<void> {
    await call('rmdir', { method: 'POST' }, { path });
  }

  async copyDir(from: string, to: string): Promise<void> {
    await call('cpdir', { method: 'POST' }, { path: from, to });
  }

  onChange(listener: (path: string) => void): () => void {
    const hot = import.meta.hot;
    if (!hot) return () => undefined;
    const handler = (data: { path: string }) => {
      listener(data.path);
    };
    hot.on('bench:file', handler);
    return () => {
      hot.off('bench:file', handler);
    };
  }
}

const PREFIX = 'bench.files:';

/**
 * Your work in this browser's storage, as if it were files: for the phone build, with no dev server to write disk.
 * `bundled` is what the build brought with it (your lesson code, as it was when the build was made): read when this
 * browser has no copy of its own yet.
 */
export class BrowserStore implements FileStore {
  readonly kind = 'browser';
  readonly home = undefined;
  constructor(
    private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'> = window.localStorage,
    private readonly bundled: Readonly<Record<string, string>> = {},
  ) {}

  private keys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key.slice(PREFIX.length));
    }
    return keys;
  }

  read(path: string): Promise<string | undefined> {
    return Promise.resolve(this.storage.getItem(PREFIX + path) ?? this.bundled[path]);
  }

  write(path: string, text: string): Promise<void> {
    this.storage.setItem(PREFIX + path, text);
    return Promise.resolve();
  }

  remove(path: string): Promise<void> {
    this.storage.removeItem(PREFIX + path);
    return Promise.resolve();
  }

  list(dir: string): Promise<readonly Entry[]> {
    const prefix = dir === '' ? '' : `${dir}/`;
    const seen = new Map<string, boolean>();
    for (const key of this.keys()) {
      if (!key.startsWith(prefix)) continue;
      const [name, ...rest] = key.slice(prefix.length).split('/');
      if (name) seen.set(name, (seen.get(name) ?? false) || rest.length > 0);
    }
    return Promise.resolve([...seen].map(([name, isDir]) => ({ name, dir: isDir })));
  }

  removeDir(path: string): Promise<void> {
    for (const key of this.keys()) if (key.startsWith(`${path}/`)) this.storage.removeItem(PREFIX + key);
    return Promise.resolve();
  }

  copyDir(from: string, to: string): Promise<void> {
    for (const key of this.keys()) {
      if (!key.startsWith(`${from}/`)) continue;
      const text = this.storage.getItem(PREFIX + key);
      if (text !== null) this.storage.setItem(PREFIX + to + key.slice(from.length), text);
    }
    return Promise.resolve();
  }

  onChange(): () => void {
    return () => undefined;
  }
}

/** The store to use: your home folder through the dev server when there's one set, or this browser. */
export async function openStore(): Promise<FileStore> {
  const status = await homeStatus();
  if (status?.exists && status.home !== undefined) return new DiskStore(status.home);
  return new BrowserStore(window.localStorage, BUNDLED_LESSONS);
}
