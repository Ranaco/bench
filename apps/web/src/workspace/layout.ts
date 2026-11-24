import type { DockviewApi, DockviewGroupPanel, Direction, SerializedDockview } from 'dockview-react';

/**
 * The windows of the workspace and where they go. Each mode keeps its own
 * arrangement, saved as you change it, so it's there next time.
 */

export type Mode = 'lessons' | 'build';
export type WindowId = 'lesson' | 'board' | 'parts' | 'meter' | 'inspector' | 'graph' | 'serial' | 'spec' | 'view3d' | 'code';

export const WINDOW_TITLES: Readonly<Record<WindowId, string>> = {
  lesson: 'Lesson',
  board: 'Board',
  parts: 'Parts',
  meter: 'Meter',
  inspector: 'Inspector',
  graph: 'Graph',
  serial: 'Serial Monitor',
  spec: 'Spec sheet',
  view3d: '3D view',
  code: 'Code',
};

/** The windows each mode has, in menu order. */
export const WINDOWS: Readonly<Record<Mode, readonly WindowId[]>> = {
  lessons: ['lesson', 'board', 'view3d', 'code', 'parts', 'meter', 'inspector', 'graph', 'serial', 'spec'],
  build: ['board', 'view3d', 'code', 'parts', 'meter', 'inspector', 'graph', 'serial', 'spec'],
};

/**
 * Bumped whenever the windows change, so an old saved arrangement is dropped for
 * the new default rather than misread (2 added the Meter; 3 tabbed the Graph with the Inspector; 4 gave the
 * Meter room for its guess box; 5 gave Parts a second row, for the switch and the button; 6 added the Spec sheet,
 * tabbed with the Meter; 7 added 3D, tabbed with the Board; 8 added the Serial Monitor, tabbed with the Inspector;
 * 9 added the Code window, below the Board when it's opened).
 */
const LAYOUT_VERSION = 9;
const storageKey = (mode: Mode) => `bench.layout.${mode}`;

/** Where a window goes when it's opened, by the first neighbour that's open: [neighbour, side]. */
const HOMES: Readonly<Record<WindowId, readonly (readonly [WindowId, Direction])[]>> = {
  lesson: [['board', 'left']],
  board: [
    ['lesson', 'right'],
    ['parts', 'left'],
    ['inspector', 'left'],
  ],
  parts: [
    ['meter', 'above'],
    ['inspector', 'above'],
    ['board', 'right'],
  ],
  meter: [
    ['parts', 'below'],
    ['inspector', 'above'],
    ['board', 'right'],
  ],
  inspector: [
    ['meter', 'below'],
    ['parts', 'below'],
    ['graph', 'above'],
    ['board', 'right'],
  ],
  graph: [
    ['inspector', 'within'],
    ['meter', 'below'],
    ['parts', 'below'],
    ['board', 'right'],
  ],
  // With the Inspector and the Graph: what the program says, beside what the circuit does.
  serial: [
    ['inspector', 'within'],
    ['graph', 'within'],
    ['meter', 'below'],
    ['board', 'right'],
  ],
  // Beside the Board: a part in 3D wants the room.
  view3d: [
    ['board', 'within'],
    ['lesson', 'right'],
    ['parts', 'left'],
  ],
  // Below the Board: you edit a part's code and watch it run, both at once.
  code: [
    ['board', 'below'],
    ['view3d', 'below'],
    ['lesson', 'right'],
  ],
  // Beside the Meter, the taller window: a spec sheet is a long read.
  spec: [
    ['meter', 'within'],
    ['inspector', 'within'],
    ['parts', 'below'],
    ['board', 'right'],
  ],
};

/** Opens a window where it belongs, or brings it to the front if it's already open. */
export function openWindow(api: DockviewApi, id: WindowId, size: { initialWidth?: number; initialHeight?: number } = {}): void {
  const open = api.getPanel(id);
  if (open) {
    open.api.setActive();
    return;
  }
  const home = HOMES[id].find(([neighbour]) => api.getPanel(neighbour));
  // The Code window opens tall enough to read a part's code, under a board still big enough to watch.
  const sized = id === 'code' && size.initialHeight === undefined ? { ...size, initialHeight: 380 } : size;
  const options = { id, component: id, title: WINDOW_TITLES[id], ...sized };
  api.addPanel(home ? { ...options, position: { referencePanel: home[0], direction: home[1] } } : options);
}

/** Tall enough for two rows of part tiles under the tab bar (a lesson's parts), or three (Build's, all ten). */
const PARTS_HEIGHT: Readonly<Record<Mode, number>> = { lessons: 242, build: 331 };
/** Tall enough for the meter's mode switch, its reading, what it's on, and the box to guess it in. */
const METER_HEIGHT = 390;

const isWindow = (id: string | undefined): id is WindowId => id !== undefined && Object.hasOwn(WINDOW_TITLES, id);

const SIDE = { left: 'left', right: 'right', above: 'top', below: 'bottom', within: 'center' } as const;

/** Docks a floating group back where its window belongs, beside the first of its neighbours still in the grid. */
export function dockBack(api: DockviewApi, group: DockviewGroupPanel): void {
  const id = group.activePanel?.id;
  for (const [neighbour, direction] of isWindow(id) ? HOMES[id] : []) {
    const target = api.getPanel(neighbour)?.group;
    if (target && target !== group && target.api.location.type === 'grid') {
      group.api.moveTo({ group: target, position: SIDE[direction] });
      return;
    }
  }
  group.api.moveTo({ position: 'right' });
}

/** The arrangement a mode starts with: the board in the middle, the lesson to its left, tools to its right. */
export function defaultLayout(api: DockviewApi, mode: Mode): void {
  api.clear();
  openWindow(api, 'board');
  if (mode === 'lessons') openWindow(api, 'lesson', { initialWidth: 320 });
  openWindow(api, 'parts', { initialWidth: 340 });
  openWindow(api, 'meter');
  openWindow(api, 'inspector');
  openWindow(api, 'graph');
  openWindow(api, 'serial');
  openWindow(api, 'spec');
  openWindow(api, 'view3d');
  api.getPanel('meter')?.api.setActive(); // the Spec sheet waits in the tab beside it
  api.getPanel('parts')?.group.api.setSize({ height: PARTS_HEIGHT[mode] });
  api.getPanel('meter')?.group.api.setSize({ height: METER_HEIGHT });
  api.getPanel('inspector')?.api.setActive(); // the Graph waits in the tab beside it
  api.getPanel('board')?.api.setActive(); // and 3D in the tab beside the Board
}

/** Brings back the saved arrangement, or the default when there's none or it can't be read. */
export function restoreLayout(api: DockviewApi, mode: Mode): void {
  const saved = readLayout(mode);
  if (saved) {
    try {
      api.fromJSON(saved);
      const allowed = new Set<string>(WINDOWS[mode]);
      if (api.panels.length > 0 && api.panels.every((panel) => allowed.has(panel.id))) return;
    } catch {
      // Falls through to the default.
    }
  }
  defaultLayout(api, mode);
}

function readLayout(mode: Mode): SerializedDockview | undefined {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(storageKey(mode)) ?? 'null');
    if (typeof saved !== 'object' || saved === null || !('version' in saved) || !('layout' in saved)) return undefined;
    return saved.version === LAYOUT_VERSION ? (saved.layout as SerializedDockview) : undefined;
  } catch {
    return undefined;
  }
}

export function saveLayout(api: DockviewApi, mode: Mode): void {
  try {
    window.localStorage.setItem(storageKey(mode), JSON.stringify({ version: LAYOUT_VERSION, layout: api.toJSON() }));
  } catch {
    // Private windows can refuse storage; the arrangement just won't be remembered.
  }
}
