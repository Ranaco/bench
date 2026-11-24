/** Projects as folders in a store: made, listed, renamed, copied, deleted, and boards from an older Bench brought over. */
import { describe, expect, it } from 'vitest';
import { addPart, EMPTY_BOARD } from '../builder/board';
import { CATALOG } from '../builder/catalog';
import { BrowserStore } from '../files/store';
import {
  bringOverBrowserBoards,
  createProject,
  deleteProject,
  duplicateProject,
  listProjects,
  NAME_LENGTH,
  programPath,
  readProject,
  renameProject,
  saveBoard,
  slugOf,
} from './projects';

/** Browser-like storage kept in a Map. */
function memoryStorage(start: Record<string, string> = {}) {
  const items = new Map(Object.entries(start));
  return {
    items,
    get length() {
      return items.size;
    },
    key: (i: number) => [...items.keys()][i] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
}

const withLed = addPart(EMPTY_BOARD, 'led', 0, 0, CATALOG.led.defaults).board;
const withChip = addPart(withLed, 'esp32', 200, 0, CATALOG.esp32.defaults);

describe('Projects', () => {
  it('names folders from names, plainly', () => {
    expect(slugOf('Night light!')).toBe('night-light');
    expect(slugOf('  ')).toBe('project');
    expect(slugOf('Ünïcode Bøard')).toBe('unicode-b-ard');
  });

  it('makes them, numbered, and lists the newest first', async () => {
    const store = new BrowserStore(memoryStorage());
    expect(await listProjects(store)).toEqual([]);
    const first = await createProject(store, { now: 1000 });
    const second = await createProject(store, { now: 2000 });
    expect(first).toBe('project-1');
    expect((await listProjects(store)).map((p) => [p.slug, p.name])).toEqual([
      [second, 'Project 2'],
      [first, 'Project 1'],
    ]);
  });

  it('keeps two with the same name in two folders', async () => {
    const store = new BrowserStore(memoryStorage());
    expect(await createProject(store, { name: 'Dimmer' })).toBe('dimmer');
    expect(await createProject(store, { name: 'Dimmer' })).toBe('dimmer-2');
  });

  it('saves the board, and that moves it to the top', async () => {
    const store = new BrowserStore(memoryStorage());
    const older = await createProject(store, { now: 1000 });
    await createProject(store, { now: 2000 });
    await saveBoard(store, older, withLed, 3000);
    expect((await listProjects(store))[0]).toMatchObject({ slug: older, parts: 1 });
    expect((await readProject(store, older))?.board.parts).toHaveLength(1);
  });

  it('renames, ignoring a blank name and cutting a long one to fit', async () => {
    const store = new BrowserStore(memoryStorage());
    const slug = await createProject(store);
    await renameProject(store, slug, '  Night light  ');
    expect((await readProject(store, slug))?.meta.name).toBe('Night light');
    await renameProject(store, slug, '   ');
    expect((await readProject(store, slug))?.meta.name).toBe('Night light');
    await renameProject(store, slug, 'x'.repeat(200));
    expect((await readProject(store, slug))?.meta.name).toHaveLength(NAME_LENGTH);
  });

  it('copies one, programs and all, and deletes one', async () => {
    const store = new BrowserStore(memoryStorage());
    const slug = await createProject(store, { name: 'Blink', board: withChip.board, programs: { [withChip.id]: 'export function loop() {}' } });
    const copy = await duplicateProject(store, slug);
    expect(copy).toBe('blink-copy');
    expect(await store.read(programPath(copy ?? '', withChip.id))).toBe('export function loop() {}');
    await deleteProject(store, slug);
    expect((await listProjects(store)).map((p) => p.slug)).toEqual(['blink-copy']);
  });

  it('brings boards an older Bench kept in the browser over, once, each ESP32 with the program they ran', async () => {
    const storage = memoryStorage({
      'bench.boards': JSON.stringify([{ id: 'a', name: 'Dimmer', edited: 1 }]),
      'bench.boards.a': JSON.stringify(withChip.board),
      'bench.board': JSON.stringify(withLed),
    });
    const store = new BrowserStore(memoryStorage());
    expect(await bringOverBrowserBoards(store, storage, 'export function loop() {}')).toBe(2);
    expect(await bringOverBrowserBoards(store, storage, 'export function loop() {}')).toBe(0); // once
    const projects = await listProjects(store);
    expect(projects.map((p) => p.name).sort()).toEqual(['Board from before', 'Dimmer']);
    expect(await store.read(programPath('dimmer', withChip.id))).toBe('export function loop() {}');
    expect(storage.items.get('bench.boards.a')).toBeDefined(); // the original stays
  });
});
