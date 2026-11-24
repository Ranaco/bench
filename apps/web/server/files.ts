/**
 * Bench's dev server reading and writing your home folder: your lesson code and your projects, as real files that git,
 * the tests and your editor see too. Only the dev server has this (`vite`, never `vite preview`): a build served to a
 * phone keeps its files in that browser instead.
 *
 * What may call it, and touch what:
 *   - only Bench's own page: the Host must be this machine and the Origin (when sent) this server, and every call
 *     carries an X-Bench header, which a page on another site can't send without a preflight that's never granted;
 *   - only inside the home folder (its real path, so a link can't lead out), and only .ts and .json files.
 */
import { createHash } from 'node:crypto';
import { existsSync, watch, type FSWatcher } from 'node:fs';
import { cp, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

const API = '/__bench/';
const CONFIG = 'bench.local.json';
const FILE_TYPES = ['.ts', '.json'];
/** The most a file may be: far more than any part's code or board. */
const MAX_BYTES = 2 * 1024 * 1024;

/** What Bench writes into a new home folder, so an editor outside Bench (nvim, VS Code) understands `bench` too. */
function homeTsconfig(repo: string): string {
  const engine = join(repo, 'packages/engine/src').split(sep).join('/');
  const models = ['led', 'switch', 'potentiometer', 'capacitor', 'transistor', 'gpio'];
  const parts = ['battery', 'resistor', 'slide-switch', 'electrolytic', 'esp32'];
  const paths: Record<string, string[]> = {
    bench: [`${engine}/index.ts`],
    'bench/arduino': [`${engine}/program/arduino.ts`],
  };
  for (const m of models) paths[`bench/${m}`] = [`${engine}/models/${m}/default.ts`];
  for (const p of parts) paths[`bench/${p}`] = [`${engine}/parts/${p}.ts`];
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2023',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        noEmit: true,
        lib: ['ES2023'],
        types: [],
        paths,
      },
      include: ['**/*.ts'],
    },
    null,
    2,
  )}\n`;
}

/** Shims, so the old relative imports in lesson files written before there was a home folder still resolve in an editor. */
const SHIMS: Readonly<Record<string, string>> = {
  'types.ts': "// Made by Bench, so lesson files' `from '../types'` imports work here too.\nexport * from 'bench';\n",
  'thermal.ts': "// Made by Bench, so lesson files' `from '../thermal'` imports work here too.\nexport * from 'bench';\n",
};

class Refused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function benchFiles(): Plugin {
  let repo = '';
  let server: ViteDevServer | undefined;
  let watcher: FSWatcher | undefined;
  /** Recent writes Bench made itself, by path and content hash: their change events aren't news to the page. */
  const ownWrites = new Map<string, string>();

  async function readConfig(): Promise<string | undefined> {
    const file = join(repo, CONFIG);
    if (!existsSync(file)) return undefined;
    const { home } = JSON.parse(await readFile(file, 'utf8')) as { home?: unknown };
    return typeof home === 'string' && home !== '' ? home : undefined;
  }

  /** The home folder's real path, or undefined if none is set or it isn't there. */
  async function home(): Promise<string | undefined> {
    const configured = await readConfig();
    if (configured === undefined || !existsSync(configured)) return undefined;
    return realpath(configured);
  }

  /** A path inside the home folder, from one relative to it. Refuses anything that would lead out. */
  async function inside(root: string, rel: string, kind: 'file' | 'dir'): Promise<string> {
    if (rel === '' || isAbsolute(rel) || rel.includes('\0')) throw new Refused(400, 'A path inside your home folder, please.');
    const full = resolve(root, rel);
    const back = relative(root, full);
    if (back === '' || back.startsWith('..') || isAbsolute(back)) throw new Refused(403, 'That’s outside your home folder.');
    if (kind === 'file' && !FILE_TYPES.some((ext) => full.endsWith(ext))) throw new Refused(403, 'Bench only keeps .ts and .json files.');
    // Whatever exists of it must really be inside, links followed.
    let existing = full;
    while (!existsSync(existing)) existing = dirname(existing);
    const real = await realpath(existing);
    const realBack = relative(root, real);
    if (realBack.startsWith('..') || isAbsolute(realBack)) throw new Refused(403, 'That leads outside your home folder.');
    return full;
  }

  function startWatching(root: string): void {
    watcher?.close();
    watcher = undefined;
    try {
      watcher = watch(root, { recursive: true }, (_event, name) => {
        if (!name) return;
        const rel = name.split(sep).join('/');
        if (!FILE_TYPES.some((ext) => rel.endsWith(ext))) return;
        void readFile(join(root, rel), 'utf8').then(
          (text) => {
            const hash = createHash('sha1').update(text).digest('hex');
            if (ownWrites.get(rel) === hash) return;
            server?.ws.send({ type: 'custom', event: 'bench:file', data: { path: rel } });
          },
          () => server?.ws.send({ type: 'custom', event: 'bench:file', data: { path: rel } }),
        );
      });
    } catch {
      // Watching isn't possible here: Bench still works, it just won't see edits made outside it until reloaded.
    }
  }

  async function scaffold(root: string): Promise<void> {
    await mkdir(join(root, 'lessons'), { recursive: true });
    await mkdir(join(root, 'projects'), { recursive: true });
    const tsconfig = join(root, 'tsconfig.json');
    if (!existsSync(tsconfig)) await writeFile(tsconfig, homeTsconfig(repo));
    for (const [name, text] of Object.entries(SHIMS)) {
      const file = join(root, name);
      if (!existsSync(file)) await writeFile(file, text);
    }
  }

  function check(req: IncomingMessage): void {
    const host = req.headers.host ?? '';
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) throw new Refused(403, 'Only from this machine.');
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== `http://${host}`) throw new Refused(403, 'Only from Bench’s own page.');
    if (req.headers['x-bench'] !== '1') throw new Refused(403, 'Only from Bench’s own page.');
  }

  async function body(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > MAX_BYTES) throw new Refused(413, 'That’s too big for a file in Bench.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  async function handle(req: IncomingMessage, res: ServerResponse, route: string, query: URLSearchParams): Promise<void> {
    const send = (status: number, value: unknown) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(value));
    };
    const method = req.method ?? 'GET';

    if (route === 'home') {
      if (method === 'GET') {
        const configured = await readConfig();
        const root = await home();
        send(200, { home: configured, exists: root !== undefined, repo: repo.split(sep).join('/') });
        return;
      }
      if (method === 'PUT') {
        const { home: wanted, create } = JSON.parse(await body(req)) as { home?: unknown; create?: unknown };
        if (typeof wanted !== 'string' || !isAbsolute(wanted)) throw new Refused(400, 'A full path, please, like C:\\Users\\you\\bench-home.');
        if (!existsSync(wanted)) {
          if (create !== true) throw new Refused(404, 'There’s no folder there yet.');
          await mkdir(wanted, { recursive: true });
        } else if (!(await stat(wanted)).isDirectory()) {
          throw new Refused(400, 'That’s a file, not a folder.');
        }
        const real = await realpath(wanted);
        if (relative(repo, real) === '' || !relative(repo, real).startsWith('..')) throw new Refused(400, 'Pick a folder outside Bench’s own repo, so your work stays yours.');
        await scaffold(real);
        await writeFile(join(repo, CONFIG), `${JSON.stringify({ home: real }, null, 2)}\n`);
        startWatching(real);
        send(200, { home: real, exists: true });
        return;
      }
    }

    const root = await home();
    if (!root) throw new Refused(409, 'No home folder yet: choose one in Settings.');
    const path = query.get('path') ?? '';

    if (route === 'file') {
      const full = await inside(root, path, 'file');
      if (method === 'GET') {
        // Not there yet is an answer, not an error: a lesson file you haven't started, a program not written.
        if (!existsSync(full)) {
          send(200, { missing: true });
          return;
        }
        send(200, { text: await readFile(full, 'utf8') });
        return;
      }
      if (method === 'PUT') {
        const text = await body(req);
        await mkdir(dirname(full), { recursive: true });
        ownWrites.set(path, createHash('sha1').update(text).digest('hex'));
        await writeFile(full, text);
        send(200, { ok: true });
        return;
      }
      if (method === 'DELETE') {
        await rm(full, { force: true });
        send(200, { ok: true });
        return;
      }
    }

    if (route === 'list' && method === 'GET') {
      const full = path === '' ? root : await inside(root, path, 'dir');
      if (!existsSync(full)) {
        send(200, { entries: [] });
        return;
      }
      const entries = await readdir(full, { withFileTypes: true });
      send(200, { entries: entries.filter((e) => !e.name.startsWith('.')).map((e) => ({ name: e.name, dir: e.isDirectory() })) });
      return;
    }

    // Folders: only projects can be removed or copied whole.
    if ((route === 'rmdir' || route === 'cpdir') && method === 'POST') {
      const under = (rel: string) => rel.startsWith('projects/') && rel.split('/').length === 2 && /^[a-z0-9-]+$/.test(rel.split('/')[1] ?? '');
      if (!under(path)) throw new Refused(403, 'Only a project’s folder.');
      const full = await inside(root, path, 'dir');
      if (route === 'rmdir') {
        await rm(full, { recursive: true, force: true });
        send(200, { ok: true });
        return;
      }
      const to = query.get('to') ?? '';
      if (!under(to)) throw new Refused(403, 'Only into a project’s folder.');
      const target = await inside(root, to, 'dir');
      if (existsSync(target)) throw new Refused(409, 'There’s a project there already.');
      await cp(full, target, { recursive: true });
      send(200, { ok: true });
      return;
    }

    throw new Refused(404, 'Bench has no such call.');
  }

  return {
    name: 'bench-files',
    // Only the dev server: never in a build, never in `vite preview`.
    apply: 'serve',
    configureServer(dev) {
      // The tests run on a Vite server too: they need no home folder, and a watcher would keep them from exiting.
      if (process.env.VITEST) return;
      server = dev;
      repo = resolve(dev.config.root, '../..');
      void home().then((root) => {
        if (root) startWatching(root);
      });
      dev.httpServer?.on('close', () => watcher?.close());
      dev.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith(API)) {
          next();
          return;
        }
        const parsed = new URL(url, 'http://localhost');
        const route = parsed.pathname.slice(API.length);
        void (async () => {
          try {
            check(req);
            await handle(req, res, route, parsed.searchParams);
          } catch (error) {
            const status = error instanceof Refused ? error.status : 500;
            res.statusCode = status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
          }
        })();
      });
    },
  };
}

const LESSONS_MODULE = 'virtual:bench-lessons';

/**
 * Your lesson code, inside a build: a build has no dev server to read your home folder, so the page you open on your
 * phone would otherwise find no lesson code and run every lesson's part as its empty stub. Read at build time from
 * the home folder in bench.local.json; the dev server reads the folder itself, so there it's empty.
 */
export function benchBundledLessons(): Plugin {
  let building = false;
  let repo = '';
  return {
    name: 'bench-bundled-lessons',
    configResolved(config) {
      building = config.command === 'build';
      repo = resolve(config.root, '../..');
    },
    resolveId: (id) => (id === LESSONS_MODULE ? `\0${LESSONS_MODULE}` : undefined),
    async load(id) {
      if (id !== `\0${LESSONS_MODULE}`) return undefined;
      const lessons: Record<string, string> = {};
      const config = join(repo, CONFIG);
      if (building && existsSync(config)) {
        const { home } = JSON.parse(await readFile(config, 'utf8')) as { home?: unknown };
        const folder = typeof home === 'string' ? join(home, 'lessons') : undefined;
        if (folder && existsSync(folder)) {
          for (const name of await readdir(folder)) {
            if (name.endsWith('.ts')) lessons[`lessons/${name}`] = await readFile(join(folder, name), 'utf8');
          }
        }
      }
      return `export default ${JSON.stringify(lessons)};`;
    },
  };
}
