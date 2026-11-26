/**
 * Projects: every board you build in Build is a project of its own, a folder in your home folder.
 *
 *   projects/<slug>/project.json            its name, and when it last changed
 *   projects/<slug>/board.json              the board: parts and wires
 *   projects/<slug>/programs/<part>.ts      each ESP32's program, by the chip's part id
 *   projects/<slug>/parts/<module>.ts       a part's source, edited for this project only ("Edit source")
 */
import { EMPTY_BOARD, type Board } from '../builder/board';
import { parseBoard } from '../builder/save';
import type { FileStore } from '../files/store';

export interface ProjectMeta {
  readonly name: string;
  /** When it last changed, ms since 1970. */
  readonly edited: number;
}

export interface ProjectSummary extends ProjectMeta {
  readonly slug: string;
  readonly parts: number;
}

/** The longest a project's name may be: enough for a few words, short enough for the header. */
export const NAME_LENGTH = 60;

export const projectDir = (slug: string) => `projects/${slug}`;
export const programPath = (slug: string, partId: string) => `${projectDir(slug)}/programs/${partId}.ts`;

/** A folder name from a project's name: "Night light" is night-light. */
export function slugOf(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents: Ü is U
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug === '' ? 'project' : slug;
}

/** What a new ESP32 runs until you write it a program. */
export const STARTER_PROGRAM = `/**
 * This ESP32's program. Bench runs setup() once when the board starts, then loop() over and over, as an Arduino does.
 * Everything comes from 'bench/arduino': pinMode, digitalWrite, digitalRead, analogRead, millis, delay, Serial.
 * A function that waits with \`await delay(ms)\` is \`async\`.
 */
import { delay, digitalWrite, HIGH, LOW, OUTPUT, pinMode } from 'bench/arduino';

export function setup(): void {
  pinMode(2, OUTPUT);
}

export async function loop(): Promise<void> {
  digitalWrite(2, HIGH);
  await delay(500);
  digitalWrite(2, LOW);
  await delay(500);
}
`;

function readMeta(text: string | undefined): ProjectMeta | undefined {
  if (text === undefined) return undefined;
  try {
    const value = JSON.parse(text) as Partial<ProjectMeta>;
    if (typeof value.name !== 'string') return undefined;
    return { name: value.name, edited: typeof value.edited === 'number' ? value.edited : 0 };
  } catch {
    return undefined;
  }
}

const writeMeta = (store: FileStore, slug: string, meta: ProjectMeta) => store.write(`${projectDir(slug)}/project.json`, `${JSON.stringify(meta, null, 2)}\n`);

/** Every project, the most recently changed first. */
export async function listProjects(store: FileStore): Promise<ProjectSummary[]> {
  const entries = await store.list('projects');
  const found = await Promise.all(
    entries
      .filter((e) => e.dir)
      .map(async (e): Promise<ProjectSummary | undefined> => {
        const meta = readMeta(await store.read(`${projectDir(e.name)}/project.json`));
        if (!meta) return undefined;
        const board = parseBoard((await store.read(`${projectDir(e.name)}/board.json`)) ?? null);
        return { ...meta, slug: e.name, parts: board?.parts.length ?? 0 };
      }),
  );
  return found.filter((p): p is ProjectSummary => p !== undefined).sort((a, b) => b.edited - a.edited);
}

/** A folder name for `name` that no project has yet. */
async function freeSlug(store: FileStore, name: string): Promise<string> {
  const taken = new Set((await store.list('projects')).map((e) => e.name));
  const base = slugOf(name);
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${String(n)}`;
  return slug;
}

/** "Project 1", "Project 2"…: the first number no project's name already uses. */
async function nextName(store: FileStore): Promise<string> {
  const taken = new Set((await listProjects(store)).map((p) => p.name));
  let n = 1;
  while (taken.has(`Project ${String(n)}`)) n++;
  return `Project ${String(n)}`;
}

/** Makes a project (an empty board, unless given one) and returns its folder name. */
export async function createProject(
  store: FileStore,
  { name, board = EMPTY_BOARD, programs = {}, now = Date.now() }: { name?: string; board?: Board; programs?: Readonly<Record<string, string>>; now?: number } = {},
): Promise<string> {
  const finalName = (name ?? (await nextName(store))).trim().slice(0, NAME_LENGTH) || 'Project';
  const slug = await freeSlug(store, finalName);
  await store.write(`${projectDir(slug)}/board.json`, `${JSON.stringify(board)}\n`);
  for (const [partId, text] of Object.entries(programs)) await store.write(programPath(slug, partId), text);
  await writeMeta(store, slug, { name: finalName, edited: now });
  return slug;
}

export async function readProject(store: FileStore, slug: string): Promise<{ meta: ProjectMeta; board: Board } | undefined> {
  const meta = readMeta(await store.read(`${projectDir(slug)}/project.json`));
  if (!meta) return undefined;
  const board = parseBoard((await store.read(`${projectDir(slug)}/board.json`)) ?? null) ?? EMPTY_BOARD;
  return { meta, board };
}

/** Saves the board, and notes the change so the project moves to the top of the list. */
export async function saveBoard(store: FileStore, slug: string, board: Board, now = Date.now()): Promise<void> {
  await store.write(`${projectDir(slug)}/board.json`, `${JSON.stringify(board)}\n`);
  const meta = readMeta(await store.read(`${projectDir(slug)}/project.json`));
  if (meta) await writeMeta(store, slug, { ...meta, edited: now });
}

/** Renames a project (its folder keeps its name). A name that's only spaces is ignored; one too long is cut to fit. */
export async function renameProject(store: FileStore, slug: string, name: string): Promise<void> {
  const trimmed = name.trim().slice(0, NAME_LENGTH);
  const meta = readMeta(await store.read(`${projectDir(slug)}/project.json`));
  if (trimmed === '' || !meta) return;
  await writeMeta(store, slug, { ...meta, name: trimmed });
}

/** Copies a project, everything in it, as "… copy"; returns the copy's folder name. */
export async function duplicateProject(store: FileStore, slug: string, now = Date.now()): Promise<string | undefined> {
  const meta = readMeta(await store.read(`${projectDir(slug)}/project.json`));
  if (!meta) return undefined;
  const name = `${meta.name} copy`.slice(0, NAME_LENGTH);
  const copy = await freeSlug(store, name);
  await store.copyDir(projectDir(slug), projectDir(copy));
  await writeMeta(store, copy, { ...meta, name, edited: now });
  return copy;
}

/** Deletes a project for good, everything in it. */
export async function deleteProject(store: FileStore, slug: string): Promise<void> {
  await store.removeDir(projectDir(slug));
}

/**
 * Brings boards kept in this browser by an older Bench into projects: Build's save slots (bench.boards), and before
 * those its one board (bench.board). Each ESP32 on them gets `program` (what they all ran then). Each board comes over
 * once; the originals stay where they were.
 */
export async function bringOverBrowserBoards(store: FileStore, storage: Pick<Storage, 'getItem' | 'setItem'>, program: string | undefined): Promise<number> {
  const DONE = 'bench.projects.broughtOver';
  const done = new Set<string>((JSON.parse(storage.getItem(DONE) ?? '[]') as unknown[]).filter((x): x is string => typeof x === 'string'));
  const boards: { key: string; name: string; text: string | null }[] = [];
  try {
    const list = JSON.parse(storage.getItem('bench.boards') ?? '[]') as { id?: unknown; name?: unknown }[];
    for (const entry of list) {
      if (typeof entry.id !== 'string') continue;
      boards.push({ key: `bench.boards.${entry.id}`, name: typeof entry.name === 'string' ? entry.name : 'Board', text: storage.getItem(`bench.boards.${entry.id}`) });
    }
  } catch {
    // A damaged list: nothing to bring over from it.
  }
  boards.push({ key: 'bench.board', name: 'Board from before', text: storage.getItem('bench.board') });
  let brought = 0;
  for (const { key, name, text } of boards) {
    if (done.has(key)) continue;
    const board = parseBoard(text);
    if (board && board.parts.length > 0) {
      const programs: Record<string, string> = {};
      if (program !== undefined) for (const part of board.parts) if (part.kind === 'esp32') programs[part.id] = program;
      await createProject(store, { name, board, programs });
      brought++;
    }
    done.add(key);
    storage.setItem(DONE, JSON.stringify([...done]));
  }
  return brought;
}
