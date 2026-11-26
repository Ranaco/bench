/** How the code editor behaves, as you've set it in Settings: kept in this browser. */

const VIM_KEY = 'bench.editor.vim';

/** Vim keys in the editor: on or off. */
export function vimKeys(): boolean {
  try {
    return window.localStorage.getItem(VIM_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setVimKeys(on: boolean): void {
  try {
    window.localStorage.setItem(VIM_KEY, on ? 'on' : 'off');
  } catch {
    // Not kept: it's on for now, and off again next time.
  }
}
