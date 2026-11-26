/**
 * The Code window's TypeScript worker: Monaco's own, asking TypeScript for what VS Code or nvim would get and Monaco
 * leaves out. Completions offer names you haven't imported yet, and picking one adds the import (completions.ts);
 * the quick fix (Ctrl+.) on a name it can't find offers to import it. Imports are always by the names Bench gives
 * its code ('bench', 'bench/arduino', 'bench/motor'…), never a path into the engine.
 */
import type { CodeFixAction, CompletionEntryData, CompletionEntryDetails, CompletionInfo, CompletionsTriggerCharacter, FormatCodeSettings, UserPreferences } from 'typescript';
import { initialize } from 'monaco-editor/internal/common/initialize';
import { TypeScriptWorker } from 'monaco-editor/languages/features/typescript/tsWorker';

const PREFERENCES: UserPreferences = {
  includeCompletionsForModuleExports: true,
  includeCompletionsForImportStatements: true,
  includeCompletionsWithInsertText: true,
  importModuleSpecifierPreference: 'non-relative',
  quotePreference: 'single',
  // Nothing but 'bench' and 'bench/…': no path into the engine, and not the old relative imports.
  autoImportSpecifierExcludeRegexes: ['^(?!bench(/|$))'],
};

/** How an added import is laid out: as Bench's own files are. */
const FORMAT: FormatCodeSettings = {
  indentSize: 2,
  tabSize: 2,
  convertTabsToSpaces: true,
  insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
};

/** The characters TypeScript completes after, of those the editor sends. */
const TRIGGERS: readonly string[] = ['.', '"', "'", '`', '/', '@', '<', '#', ' '];

const isTrigger = (character: string | undefined): character is CompletionsTriggerCharacter =>
  character !== undefined && TRIGGERS.includes(character);

class BenchWorker extends TypeScriptWorker {
  override getCompletionsAtPosition(fileName: string, position: number, triggerCharacter?: string): Promise<CompletionInfo | undefined> {
    const trigger = isTrigger(triggerCharacter) ? triggerCharacter : undefined;
    return Promise.resolve(this.getLanguageService().getCompletionsAtPosition(fileName, position, { ...PREFERENCES, triggerCharacter: trigger }));
  }

  override getCompletionEntryDetails(
    fileName: string,
    position: number,
    entry: string,
    source?: string,
    data?: CompletionEntryData,
  ): Promise<CompletionEntryDetails | undefined> {
    return Promise.resolve(this.getLanguageService().getCompletionEntryDetails(fileName, position, entry, FORMAT, source, PREFERENCES, data));
  }

  override getCodeFixesAtPosition(
    fileName: string,
    start: number,
    end: number,
    errorCodes: number[],
    formatOptions: FormatCodeSettings,
  ): Promise<readonly CodeFixAction[]> {
    try {
      return Promise.resolve(this.getLanguageService().getCodeFixesAtPosition(fileName, start, end, errorCodes, formatOptions, PREFERENCES));
    } catch {
      return Promise.resolve([]); // as Monaco's own: a fix that can't be worked out is none
    }
  }
}

self.onmessage = () => {
  initialize((ctx, createData) => new BenchWorker(ctx, createData));
};
