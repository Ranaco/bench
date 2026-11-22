import { useSyncExternalStore } from 'react';
import { lessonById, type Lesson } from './lessons/lessons';

/**
 * Where you are, kept in the address's #: a reload (including the one after
 * saving a part model) lands on the same screen, browser Back works, and a
 * fresh tab opens the main menu.
 */
export type Screen =
  | { readonly kind: 'home' }
  | { readonly kind: 'lessons' }
  | { readonly kind: 'lesson'; readonly lesson: Lesson }
  | { readonly kind: 'build' };

export const HREF = {
  home: '#/',
  lessons: '#/lessons',
  lesson: (lesson: Lesson) => `#/lessons/${lesson.id}`,
  build: '#/build',
} as const;

export function parseHash(hash: string): Screen {
  const [, first, second] = hash.replace(/^#/, '').split('/');
  if (first === 'build') return { kind: 'build' };
  if (first === 'lessons') {
    const lesson = second ? lessonById(second) : undefined;
    return lesson ? { kind: 'lesson', lesson } : { kind: 'lessons' };
  }
  return { kind: 'home' };
}

export function useScreen(): Screen {
  const hash = useSyncExternalStore(
    (changed) => {
      window.addEventListener('hashchange', changed);
      return () => {
        window.removeEventListener('hashchange', changed);
      };
    },
    () => window.location.hash,
  );
  return parseHash(hash);
}
