import {
  DockviewReact,
  themeAbyssSpaced,
  type DockviewApi,
  type DockviewReadyEvent,
  type DockviewTheme,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelProps,
} from 'dockview-react';
import { useEffect, useState, type FunctionComponent } from 'react';
import { dockBack, restoreLayout, saveLayout, type Mode, type WindowId } from './layout';
import {
  BoardWindow,
  GraphWindow,
  InspectorWindow,
  LessonWindow,
  MeterWindow,
  PartsWindow,
  SerialWindow,
  CodeWindow,
  SpecWindow,
  View3dWindow,
} from './windows';

const COMPONENTS: Readonly<Record<WindowId, FunctionComponent<IDockviewPanelProps>>> = {
  lesson: LessonWindow,
  board: BoardWindow,
  parts: PartsWindow,
  meter: MeterWindow,
  inspector: InspectorWindow,
  graph: GraphWindow,
  serial: SerialWindow,
  spec: SpecWindow,
  view3d: View3dPanel,
  code: CodePanel,
};

/** The Code window in the dock: like the 3D view, its editor loads only once the tab's first brought to the front. */
function CodePanel({ api }: IDockviewPanelProps) {
  const [visible, setVisible] = useState(api.isVisible);
  useEffect(() => {
    const changed = api.onDidVisibilityChange((event) => {
      setVisible(event.isVisible);
    });
    return () => {
      changed.dispose();
    };
  }, [api]);
  return <CodeWindow shown={visible} />;
}

/** The 3D view in the dock: a tab waiting behind the Board loads nothing until it's first brought to the front. */
function View3dPanel({ api }: IDockviewPanelProps) {
  const [visible, setVisible] = useState(api.isVisible);
  useEffect(() => {
    const changed = api.onDidVisibilityChange((event) => {
      setVisible(event.isVisible);
    });
    return () => {
      changed.dispose();
    };
  }, [api]);
  return <View3dWindow shown={visible} />;
}

/** Dockview's spaced layout (rounded windows with gaps between), coloured like the rest of Bench in styles.css. */
const THEME: DockviewTheme = { ...themeAbyssSpaced, name: 'bench', gap: 6 };

interface DockProps {
  readonly mode: Mode;
  /** Hands over the dock's controls once it's ready. */
  readonly onApi: (api: DockviewApi) => void;
}

/**
 * The workspace: windows in tabs, side by side or stacked, any size. Drag a tab
 * to move it, drag a gap to resize, float a window over the rest, maximise one.
 */
export function Dock({ mode, onApi }: DockProps) {
  const ready = (event: DockviewReadyEvent) => {
    restoreLayout(event.api, mode);
    // Saved the moment it changes (a few kilobytes), so switching modes or reloading never loses the last move.
    event.api.onDidLayoutChange(() => {
      saveLayout(event.api, mode);
    });
    onApi(event.api);
  };

  return (
    <div className="dock">
      <DockviewReact
        theme={THEME}
        components={COMPONENTS}
        onReady={ready}
        rightHeaderActionsComponent={GroupActions}
        getTabContextMenuItems={() => ['maximize', 'float', 'separator', 'close']}
      />
    </div>
  );
}

/** Buttons at the right of each window's tab bar: float it over the rest (or dock it back), and maximise it. */
function GroupActions({ api, containerApi, group }: IDockviewHeaderActionsProps) {
  const [floating, setFloating] = useState(api.location.type === 'floating');
  const [maximized, setMaximized] = useState(api.isMaximized());

  useEffect(() => {
    const moved = api.onDidLocationChange((event) => {
      setFloating(event.location.type === 'floating');
    });
    const resized = containerApi.onDidMaximizedGroupChange(() => {
      setMaximized(api.isMaximized());
    });
    return () => {
      moved.dispose();
      resized.dispose();
    };
  }, [api, containerApi]);

  return (
    <div className="group-actions">
      <button
        type="button"
        title={floating ? 'Dock this window' : 'Float this window'}
        aria-label={floating ? 'Dock this window' : 'Float this window'}
        onClick={() => {
          if (floating) dockBack(containerApi, group);
          else containerApi.addFloatingGroup(group);
        }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          {floating ? <path d="M2.5 3.5h11v9h-11z M2.5 6.5h11" /> : <path d="M2.5 5.5h8v8h-8z M5.5 5.5v-3h8v8h-3" />}
        </svg>
      </button>
      {!floating && (
        <button
          type="button"
          title={maximized ? 'Restore' : 'Maximise'}
          aria-label={maximized ? 'Restore this window' : 'Maximise this window'}
          onClick={() => {
            if (maximized) api.exitMaximized();
            else api.maximize();
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            {maximized ? (
              <path d="M6.5 2.5v4h-4 M9.5 2.5v4h4 M6.5 13.5v-4h-4 M9.5 13.5v-4h4" />
            ) : (
              <path d="M2.5 6v-3.5h3.5 M10 2.5h3.5v3.5 M2.5 10v3.5h3.5 M10 13.5h3.5v-3.5" />
            )}
          </svg>
        </button>
      )}
    </div>
  );
}
