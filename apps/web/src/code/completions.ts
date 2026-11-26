/**
 * Completions in the Code window, in place of Monaco's own, which leave out names you haven't imported yet. These
 * offer them too, labelled with where they come from ('bench/arduino'), and picking one adds its import at the top.
 * The worker (ts.worker.ts) asks TypeScript for them; this turns its answers into the editor's.
 */
import type { CompletionEntry, CompletionEntryData, CompletionEntryDetails, CompletionInfo, SymbolDisplayPart, TextSpan } from 'typescript';
import * as monaco from 'monaco-editor/editor/editor.api';
import { getTypeScriptWorker } from 'monaco-editor/languages/features/typescript/register';

/** What Bench's worker answers: Monaco's own calls, with the arguments they take there. */
interface BenchWorker {
  getCompletionsAtPosition(fileName: string, position: number, triggerCharacter?: string): Promise<CompletionInfo | undefined>;
  getCompletionEntryDetails(
    fileName: string,
    position: number,
    entry: string,
    source?: string,
    data?: CompletionEntryData,
  ): Promise<CompletionEntryDetails | undefined>;
}

async function workerFor(uri: monaco.Uri): Promise<BenchWorker> {
  const get = await getTypeScriptWorker();
  return get(uri); // ts.worker.ts behind Monaco's proxy
}

const text = (parts: readonly SymbolDisplayPart[] | undefined) => parts?.map((part) => part.text).join('') ?? '';

function rangeOf(model: monaco.editor.ITextModel, span: TextSpan): monaco.IRange {
  const start = model.getPositionAt(span.start);
  const end = model.getPositionAt(span.start + span.length);
  return { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column };
}

const Kind = monaco.languages.CompletionItemKind;

/** TypeScript's kinds of name, as the editor's icons. */
const KINDS: Readonly<Partial<Record<string, monaco.languages.CompletionItemKind>>> = {
  keyword: Kind.Keyword,
  'primitive type': Kind.Keyword,
  var: Kind.Variable,
  'local var': Kind.Variable,
  let: Kind.Variable,
  parameter: Kind.Variable,
  alias: Kind.Variable,
  const: Kind.Constant,
  property: Kind.Field,
  getter: Kind.Property,
  setter: Kind.Property,
  accessor: Kind.Property,
  method: Kind.Method,
  function: Kind.Function,
  'local function': Kind.Function,
  constructor: Kind.Constructor,
  class: Kind.Class,
  'local class': Kind.Class,
  interface: Kind.Interface,
  type: Kind.Interface,
  enum: Kind.Enum,
  'enum member': Kind.EnumMember,
  module: Kind.Module,
  'external module name': Kind.Module,
  directory: Kind.Folder,
  script: Kind.File,
  string: Kind.Value,
};

/** Where a suggestion was asked for, to look up its details and its import once it's picked. */
interface Asked {
  readonly uri: monaco.Uri;
  readonly offset: number;
  readonly entry: CompletionEntry;
}

const asked = new WeakMap<monaco.languages.CompletionItem, Asked>();

function documentation(details: CompletionEntryDetails): string {
  const tags = (details.tags ?? []).map((tag) => `*@${tag.name}* ${text(tag.text)}`);
  return [text(details.documentation), ...tags].filter((part) => part !== '').join('\n\n');
}

export const completions: monaco.languages.CompletionItemProvider = {
  triggerCharacters: ['.', '"', "'", '/', '@'],

  async provideCompletionItems(model, position, context) {
    const word = model.getWordUntilPosition(position);
    const wordRange = { startLineNumber: position.lineNumber, startColumn: word.startColumn, endLineNumber: position.lineNumber, endColumn: word.endColumn };
    const { uri } = model;
    const offset = model.getOffsetAt(position);
    const worker = await workerFor(uri);
    if (model.isDisposed()) return undefined;
    const info = await worker.getCompletionsAtPosition(uri.toString(), offset, context.triggerCharacter);
    if (!info || model.isDisposed()) return undefined;
    const suggestions = info.entries.map((entry) => {
      const item: monaco.languages.CompletionItem = {
        label: { label: entry.name, description: entry.sourceDisplay ? text(entry.sourceDisplay) : undefined },
        kind: KINDS[entry.kind] ?? Kind.Property,
        insertText: entry.insertText ?? entry.name,
        filterText: entry.filterText,
        sortText: entry.sortText,
        range: entry.replacementSpan ? rangeOf(model, entry.replacementSpan) : wordRange,
        tags: entry.kindModifiers?.includes('deprecated') ? [monaco.languages.CompletionItemTag.Deprecated] : undefined,
      };
      asked.set(item, { uri, offset, entry });
      return item;
    });
    return { suggestions };
  },

  async resolveCompletionItem(item) {
    const at = asked.get(item);
    const model = at && monaco.editor.getModel(at.uri);
    if (!at || !model) return item;
    const worker = await workerFor(at.uri);
    const details = await worker.getCompletionEntryDetails(at.uri.toString(), at.offset, at.entry.name, at.entry.source, at.entry.data);
    if (!details || model.isDisposed()) return item;
    // Its import, for a name from another file: TypeScript's edits to this one.
    const edits = (details.codeActions ?? [])
      .flatMap((action) => action.changes)
      .filter((change) => change.fileName === at.uri.toString())
      .flatMap((change) => change.textChanges)
      .map((change) => ({ range: rangeOf(model, change.span), text: change.newText }));
    return {
      ...item,
      detail: text(details.displayParts),
      documentation: { value: documentation(details) },
      additionalTextEdits: edits.length > 0 ? edits : undefined,
    };
  },
};
