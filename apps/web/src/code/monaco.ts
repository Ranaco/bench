/**
 * The editor in the Code window: Monaco, the editor inside VS Code, with TypeScript only. It loads when the Code window
 * first opens, never with the page. Bench's engine is given to it as source, so `import … from 'bench'` gets
 * autocomplete, hover docs and red squiggles, all from the same code the board runs.
 */
import * as monaco from 'monaco-editor/editor/editor.api';
// The whole editor: autocomplete, quick fixes, find, folding and the rest (the API alone leaves them out).
import 'monaco-editor/editor/editor.main';
import { ModuleKind, ModuleResolutionKind, ScriptTarget, typescriptDefaults } from 'monaco-editor/languages/features/typescript/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { completions } from './completions';
// Monaco's TypeScript worker, asking for what it leaves out: names not imported yet, and their imports.
import TsWorker from './ts.worker?worker';

(self as unknown as { MonacoEnvironment: { getWorker(id: string, label: string): Worker } }).MonacoEnvironment = {
  getWorker: (_id, label) => (label === 'typescript' || label === 'javascript' ? new TsWorker() : new EditorWorker()),
};

/** The engine's source, every file, by its path under src/: what `bench` means to the editor. */
const ENGINE = import.meta.glob<string>('../../../../packages/engine/src/**/*.ts', { query: '?raw', import: 'default', eager: true });

const ROOT = 'file:///bench/';

typescriptDefaults.setCompilerOptions({
  target: ScriptTarget.ESNext,
  module: ModuleKind.ESNext,
  moduleResolution: ModuleResolutionKind.NodeJs, // with `paths` below, which is all 'bench' needs
  strict: true,
  noEmit: true,
  allowNonTsExtensions: true,
  baseUrl: ROOT,
  paths: {
    bench: ['engine/index.ts'],
    'bench/arduino': ['engine/program/arduino.ts'],
    'bench/battery': ['engine/parts/battery.ts'],
    'bench/resistor': ['engine/parts/resistor.ts'],
    'bench/slide-switch': ['engine/parts/slide-switch.ts'],
    'bench/electrolytic': ['engine/parts/electrolytic.ts'],
    'bench/esp32': ['engine/parts/esp32.ts'],
    'bench/*': ['engine/models/*/default.ts'],
  },
  lib: ['es2023'],
});
typescriptDefaults.setEagerModelSync(true);
// Bench's own completions instead of Monaco's: they offer names you haven't imported yet, and add the import.
typescriptDefaults.setModeConfiguration({ ...typescriptDefaults.modeConfiguration, completionItems: false });
monaco.languages.registerCompletionItemProvider('typescript', completions);

for (const [path, text] of Object.entries(ENGINE)) {
  const rel = path.slice(path.indexOf('/engine/src/') + '/engine/src/'.length);
  typescriptDefaults.addExtraLib(text, `${ROOT}engine/${rel}`);
}
// The lesson files' old relative imports, for a file in your home folder's lessons/.
typescriptDefaults.addExtraLib("export * from 'bench';\n", `${ROOT}home/types.ts`);
typescriptDefaults.addExtraLib("export * from 'bench';\n", `${ROOT}home/thermal.ts`);

monaco.editor.defineTheme('bench', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#0a0a0b',
    'editor.lineHighlightBackground': '#161618',
    'editorLineNumber.foreground': '#48484a',
    'editorLineNumber.activeForeground': '#8e8e93',
    'editorGutter.background': '#0a0a0b',
    'editorWidget.background': '#161618',
    'editorWidget.border': '#2c2c2e',
  },
});

/** Folders given the old relative imports already. */
const shimmed = new Set<string>();

/**
 * The old relative imports (`../types`, `../thermal`, `../program/arduino`) mean `bench` and `bench/arduino` from any
 * file, as the loader reads them: the editor is told so for the folder above each file it opens.
 */
function shimAround(path: string): void {
  const up = path.split('/').slice(0, -2).join('/');
  const base = `${ROOT}home/${up === '' ? '' : `${up}/`}`;
  if (shimmed.has(base)) return;
  shimmed.add(base);
  for (const name of ['types', 'thermal', 'circuit', 'materials']) typescriptDefaults.addExtraLib("export * from 'bench';\n", `${base}${name}.ts`);
  typescriptDefaults.addExtraLib("export * from 'bench/arduino';\n", `${base}program/arduino.ts`);
}

/** The model for a file: one per path, so moving between tabs keeps undo history and the cursor. */
export function modelFor(path: string, text: string): monaco.editor.ITextModel {
  shimAround(path);
  const uri = monaco.Uri.parse(`${ROOT}home/${path}`);
  const existing = monaco.editor.getModel(uri);
  if (existing) {
    if (existing.getValue() !== text) existing.setValue(text);
    return existing;
  }
  return monaco.editor.createModel(text, 'typescript', uri);
}

export { monaco };
