import { createContext, use } from 'react';
import type { BoardCode } from './useBoardCode';

/** The board's code: which code each part runs, its programs, and where they're kept. */
export const CodeContext = createContext<BoardCode | undefined>(undefined);

export const useCode = () => use(CodeContext);
