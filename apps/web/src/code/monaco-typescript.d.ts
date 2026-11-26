/**
 * Monaco's TypeScript worker, from the inside. Monaco ships types only for its public API (register), not for these;
 * this is just what Bench's own worker (ts.worker.ts) builds on.
 */
declare module 'monaco-editor/internal/common/initialize' {
  /** Starts a worker. `create` makes the object that the page's calls go to. */
  export function initialize(create: (ctx: unknown, createData: unknown) => unknown): void;
}

declare module 'monaco-editor/languages/features/typescript/tsWorker' {
  export class TypeScriptWorker {
    constructor(ctx: unknown, createData: unknown);
    getLanguageService(): import('typescript').LanguageService;
    getCompletionsAtPosition(fileName: string, position: number): Promise<import('typescript').CompletionInfo | undefined>;
    getCompletionEntryDetails(fileName: string, position: number, entry: string): Promise<import('typescript').CompletionEntryDetails | undefined>;
    getCodeFixesAtPosition(
      fileName: string,
      start: number,
      end: number,
      errorCodes: number[],
      formatOptions: import('typescript').FormatCodeSettings,
    ): Promise<readonly import('typescript').CodeFixAction[]>;
  }
}
