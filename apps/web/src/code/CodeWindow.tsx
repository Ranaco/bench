/**
 * The Code window: an ESP32's program, yours to write; or, from "Edit source", how a part behaves. A part's source
 * edited in a project is that project's own copy. The base, what every other project runs, is changed where it's
 * written: Bench's default in Bench's code, the part a lesson has you write in that lesson. Loaded only when the
 * window first opens: the editor is big.
 */
import type { ModuleId } from '@bench/engine';
import { initVimMode } from 'monaco-vim';
import { useEffect, useRef, useState } from 'react';
import type { PlacedPart } from '../builder/board';
import { CATALOG } from '../builder/catalog';
import { useSession } from '../builder/session';
import { lessonById } from '../lessons/lessons';
import { defaultText, portable, removeSource } from './actions';
import { useAsked, type CodeView } from './asked';
import { useCode } from './context';
import { modelFor, monaco } from './monaco';
import { vimKeys } from './prefs';
import { projectCodeFile, type Chosen } from './resolve';
import { DEFAULT_FILES, isLessonModule, LESSON_MODULES } from './sources';
import type { BoardCode } from './useBoardCode';

/** What each module's tab is called. */
const TAB_NAMES: Readonly<Record<ModuleId, string>> = {
  battery: 'Battery',
  resistor: 'Resistor',
  led: 'LED',
  switch: 'Contact',
  'slide-switch': 'Slide switch',
  potentiometer: 'Knob',
  capacitor: 'Capacitor',
  electrolytic: 'Can',
  transistor: 'Transistor',
  gpio: 'Pin',
  esp32: 'Board',
  diode: 'Diode',
  motor: 'Motor',
};

/** What's open in the editor: its text, its file, and whether it can be changed. */
interface Opened {
  readonly text: string;
  /** Where saving keeps it, in your home folder; undefined for Bench's default, which isn't a file of yours. */
  readonly file: string | undefined;
  readonly readOnly: boolean;
  /** What it is, in a few words. */
  readonly what: string;
}

export default function CodeWindow() {
  const { board, selection } = useSession();
  const code = useCode();
  // Whatever opened the window ("Edit program", "Edit source") says what to show, over what was shown before.
  const asked = useAsked();
  const [view, setView] = useState<CodeView['view']>(asked?.view ?? 'program');
  const [picked, setPicked] = useState<ModuleId | undefined>(asked?.view === 'source' ? asked.module : undefined);
  const [seen, setSeen] = useState(asked?.n);
  if (asked && asked.n !== seen) {
    setSeen(asked.n);
    setView(asked.view);
    setPicked(asked.view === 'source' ? asked.module : undefined);
  }
  const partId = selection.parts.length === 1 ? selection.parts[0] : undefined;
  const part = board.parts.find((p) => p.id === partId);
  const modules = part ? CATALOG[part.kind].modules : [];
  const module = picked !== undefined && modules.includes(picked) ? picked : modules.at(0);

  if (!code) return <div className="pane pane-scroll"><p className="pane-note">Code isn’t available here.</p></div>;
  if (!part || module === undefined) return <PickPart part={part} view={view} />;
  if (view === 'program' && part.kind === 'esp32') return <ProgramView code={code} chip={part} />;
  if (view === 'program') {
    return (
      <div className="pane pane-scroll">
        <p className="pane-note">{`${part.label} has no program: only an ESP32 runs one. What it does is its source.`}</p>
        <div className="code-actions">
          <button type="button" className="ghost" onClick={() => { setView('source'); }}>
            Edit source
          </button>
        </div>
      </div>
    );
  }
  return (
    <SourceView
      code={code}
      part={part}
      module={module}
      onPick={setPicked}
      onProgram={() => {
        setView('program');
      }}
    />
  );
}

/** Nothing (or wiring) selected: the parts that have what this view shows, to pick one. */
function PickPart({ part, view }: { readonly part: PlacedPart | undefined; readonly view: CodeView['view'] }) {
  const { board, select } = useSession();
  const shown = board.parts.filter((p) => (view === 'program' ? p.kind === 'esp32' : CATALOG[p.kind].modules.length > 0));
  const note = part
    ? `${part.label} is wiring: it has no code.`
    : view === 'program'
      ? shown.length > 0
        ? 'Pick an ESP32 to edit its program:'
        : 'Put an ESP32 on the board: its program is yours to write.'
      : 'Pick a part to see its source:';
  return (
    <div className="pane pane-scroll">
      <p className="pane-note">{note}</p>
      {!part && shown.length > 0 && (
        <ul className="code-parts">
          {shown.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  select({ parts: [p.id], wires: [] });
                }}
              >
                <strong>{p.label}</strong> {CATALOG[p.kind].name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** An ESP32's program: each chip has its own. */
function ProgramView({ code, chip }: { readonly code: BoardCode; readonly chip: PlacedPart }) {
  const program = code.programFor(chip.id);
  const opened: Opened = { text: program.text, file: program.file, readOnly: false, what: `${chip.label}’s program` };
  return (
    <div className="pane code-pane">
      <p className="code-what">
        <strong>{chip.label}</strong>’s program
        <span className="code-file">{program.file}</span>
      </p>
      <Editor key={program.file} opened={opened} onSaved={code.reload} />
    </div>
  );
}

/** What a module's base is, in a few words, and where it's written. */
function describeBase(module: ModuleId, chosen: Chosen): { readonly what: string; readonly file: string } {
  if (chosen.origin === 'lesson' && chosen.source && isLessonModule(module)) {
    const lesson = lessonById(LESSON_MODULES[module]);
    return { what: lesson ? `your code from Lesson ${String(lesson.number)}` : 'your code', file: chosen.source.file };
  }
  return { what: 'Bench’s default', file: DEFAULT_FILES[module] };
}

interface SourceViewProps {
  readonly code: BoardCode;
  readonly part: PlacedPart;
  readonly module: ModuleId;
  readonly onPick: (module: ModuleId) => void;
  readonly onProgram: () => void;
}

/**
 * A part's source, one module at a time (an ESP32 has two: the board, and one pin). In a project, saving keeps the
 * project's own copy; in a lesson, the part it has you write is your lesson file, and the rest are read-only.
 */
function SourceView({ code, part, module, onPick, onProgram }: SourceViewProps) {
  const modules = CATALOG[part.kind].modules;
  const chosen = code.chosen(module);
  const base = describeBase(module, code.base(module));
  const project = code.scope.project;
  const own = chosen.origin === 'project' ? chosen.source : undefined;
  const run = (work: Promise<unknown>) => {
    void work.then(code.reload);
  };

  let opened: Opened;
  let note: string | undefined;
  if (project) {
    // Edited here, it's this project's: saving the first time makes its copy.
    opened = {
      text: own?.text ?? portable(chosen.source?.text ?? defaultText(module)),
      file: projectCodeFile(project.slug, module),
      readOnly: false,
      what: own ? 'this project’s own source' : base.what,
    };
    note = own
      ? `Only this project runs it. Every other project runs ${base.what}: ${base.file}`
      : 'What you save here is this project’s only. To change it in every project, change the file above.';
  } else if (chosen.source) {
    opened = { text: chosen.source.text, file: chosen.source.file, readOnly: false, what: base.what };
  } else {
    opened = { text: defaultText(module), file: undefined, readOnly: true, what: base.what };
    note = 'Read-only here. In a project, Edit source changes it for that project.';
  }
  const problem = code.problem(module);

  return (
    <div className="pane code-pane">
      <div className="code-head">
        {(modules.length > 1 || part.kind === 'esp32') && (
          <div className="code-tabs" role="tablist" aria-label={`${part.label}’s source`}>
            {modules.length > 1 &&
              modules.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={m === module}
                  className="code-tab"
                  onClick={() => {
                    onPick(m);
                  }}
                >
                  {TAB_NAMES[m]}
                </button>
              ))}
            {part.kind === 'esp32' && (
              <button type="button" className="ghost code-switch" onClick={onProgram}>
                Edit program
              </button>
            )}
          </div>
        )}
        <p className="code-what">
          <strong>{part.label}</strong>
          {` runs ${opened.what}`}
          <span className="code-file">{own ? own.file : base.file}</span>
        </p>
        {note !== undefined && <p className="code-note">{note}</p>}
        {own && (
          <div className="code-actions">
            <RemoveButton
              label="Go back to the base"
              onRemove={() => {
                run(removeSource(code.store, own.file));
              }}
            />
          </div>
        )}
      </div>
      <Editor key={`${opened.file ?? `default/${module}`}:${own ? 'own' : 'base'}`} opened={opened} onSaved={code.reload} />
      {problem !== undefined && <p className="warning code-problem">{problem}</p>}
    </div>
  );
}

/** A remove button that asks first: going back to the base deletes the project's copy. */
function RemoveButton({ label, onRemove }: { readonly label: string; readonly onRemove: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className="ghost" onClick={() => { setAsking(true); }}>
        {label}
      </button>
    );
  }
  return (
    <span className="code-confirm">
      Delete this project’s copy?
      <button type="button" className="ghost danger" onClick={() => { setAsking(false); onRemove(); }}>
        Delete
      </button>
      <button type="button" className="ghost" autoFocus onClick={() => { setAsking(false); }}>
        Keep it
      </button>
    </span>
  );
}

/** The editor itself, for one file: Ctrl+S saves. A change on disk loads in, unless you have unsaved changes. */
function Editor({ opened, onSaved }: { readonly opened: Opened; readonly onSaved: () => void }) {
  const code = useCode();
  const host = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | undefined>(undefined);
  const saved = useRef(opened.text);
  const [dirty, setDirty] = useState(false);
  const [changedOnDisk, setChangedOnDisk] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = () => {
    const file = opened.file;
    const text = editor.current?.getValue();
    if (file === undefined || text === undefined || !code) return;
    setSaving(true);
    void code.store
      .write(file, text)
      .then(() => {
        saved.current = text;
        setDirty(false);
        setChangedOnDisk(false);
        onSaved();
      })
      .finally(() => {
        setSaving(false);
      });
  };
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  // Made once for this file (a different file is a different Editor, by its key), from the text it opened with: what
  // comes after (a save, a reload of the board's code) mustn't pull it out from under your cursor.
  const first = useRef(opened);
  const { readOnly } = opened;
  useEffect(() => {
    editor.current?.updateOptions({ readOnly });
  }, [readOnly]);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const start = first.current;
    const model = modelFor(start.file ?? `defaults/${start.what}.ts`, start.text);
    const made = monaco.editor.create(node, {
      model,
      theme: 'bench',
      readOnly: start.readOnly,
      automaticLayout: true,
      minimap: { enabled: false },
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--mono') || 'monospace',
      fontSize: 13,
      tabSize: 2,
      scrollBeyondLastLine: false,
      renderLineHighlight: 'line',
    });
    editor.current = made;
    made.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveRef.current();
    });
    const changed = made.onDidChangeModelContent(() => {
      setDirty(made.getValue() !== saved.current);
    });
    const vim = vimKeys() && status.current ? initVimMode(made, status.current) : undefined;
    return () => {
      vim?.dispose();
      changed.dispose();
      made.dispose();
      editor.current = undefined;
    };
  }, []);

  // Saved somewhere else (your editor): load it in, or say so if you've changes of your own here.
  useEffect(() => {
    const file = opened.file;
    if (!code || file === undefined) return;
    return code.store.onChange((path) => {
      if (path !== file) return;
      void code.store.read(file).then((text) => {
        if (text === undefined || text === editor.current?.getValue()) return;
        if (editor.current?.getValue() === saved.current) {
          saved.current = text;
          editor.current.setValue(text);
          setDirty(false);
        } else {
          setChangedOnDisk(true);
        }
      });
    });
  }, [code, opened.file]);

  return (
    <>
      <div className="code-editor" ref={host} />
      <div className="code-foot">
        <div className="code-vim" ref={status} />
        {changedOnDisk && (
          <span className="code-confirm">
            Changed on disk.
            <button
              type="button"
              className="ghost"
              onClick={() => {
                const file = opened.file;
                if (!code || file === undefined) return;
                void code.store.read(file).then((text) => {
                  if (text === undefined) return;
                  saved.current = text;
                  editor.current?.setValue(text);
                  setDirty(false);
                  setChangedOnDisk(false);
                });
              }}
            >
              Load it
            </button>
            <button type="button" className="ghost" onClick={() => { setChangedOnDisk(false); }}>
              Keep mine
            </button>
          </span>
        )}
        {!opened.readOnly && (
          <button type="button" className="ghost" disabled={!dirty || saving} onClick={save} aria-keyshortcuts="Control+S">
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'} <kbd>Ctrl S</kbd>
          </button>
        )}
      </div>
    </>
  );
}
