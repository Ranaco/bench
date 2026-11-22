import { createContext, use } from 'react';
import type { WindowId } from './layout';

/** Brings a window into view: to the front of the dock, or scrolled to in the stacked layout on a phone. */
export const ShowWindowContext = createContext<(id: WindowId) => void>(() => undefined);

export const useShowWindow = () => use(ShowWindowContext);
