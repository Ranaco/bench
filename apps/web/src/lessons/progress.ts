import { createContext, use, useEffect, useRef, useState } from 'react';
import type { Board } from '../builder/board';
import type { MeterState } from '../builder/meter';
import type { BoardSim } from '../builder/sync';
import type { Lesson, LessonState, Step } from './lessons';

/** How far through a lesson you are, saved so it survives a reload. */
export interface LessonProgress {
  readonly lesson: Lesson;
  readonly done: ReadonlySet<string>;
  /** The step being worked on; undefined once the lesson is finished. */
  readonly current: Step | undefined;
  readonly restart: () => void;
}

export const LessonContext = createContext<LessonProgress | undefined>(undefined);

/** The lesson being played, or undefined in Build mode. */
export function useLesson(): LessonProgress | undefined {
  return use(LessonContext);
}

const storageKey = (lesson: Lesson) => `bench.lesson.${lesson.id}.done`;

/** The steps done in a lesson, as saved. */
export function readProgress(lesson: Lesson | undefined): ReadonlySet<string> {
  if (!lesson) return new Set();
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(storageKey(lesson)) ?? '[]');
    const ids = new Set(lesson.steps.map((s) => s.id));
    return new Set(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string' && ids.has(id)) : []);
  } catch {
    return new Set();
  }
}

function save(lesson: Lesson, done: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(storageKey(lesson), JSON.stringify([...done]));
  } catch {
    // Private windows can refuse storage; progress just won't survive a reload.
  }
}

/** The first step not yet done, in order. */
export function currentStep(lesson: Lesson, done: ReadonlySet<string>): Step | undefined {
  return lesson.steps.find((step) => !done.has(step.id));
}

/**
 * Checks the step being worked on against the circuit, every frame. When it
 * passes it's done for good, and the next step is the one being checked.
 */
export function advance(lesson: Lesson, done: ReadonlySet<string>, state: LessonState): ReadonlySet<string> {
  const step = currentStep(lesson, done);
  return step?.passes(state) ? new Set([...done, step.id]) : done;
}

export function useLessonProgress(
  lesson: Lesson | undefined,
  sim: BoardSim,
  board: Board,
  meter: MeterState,
): LessonProgress | undefined {
  const [done, setDone] = useState(() => readProgress(lesson));
  const latest = useRef({ board, meter, done });
  useEffect(() => {
    latest.current = { board, meter, done };
  });

  useEffect(() => {
    if (!lesson) return;
    return sim.subscribe(() => {
      const { board: current, meter: leads, done: before } = latest.current;
      const after = advance(lesson, before, { board: current, snapshot: sim.getSnapshot(), meter: leads });
      if (after === before) return;
      latest.current = { board: current, meter: leads, done: after };
      save(lesson, after);
      setDone(after);
    });
  }, [lesson, sim]);

  if (!lesson) return undefined;
  return {
    lesson,
    done,
    current: currentStep(lesson, done),
    restart: () => {
      const fresh = new Set<string>();
      latest.current = { ...latest.current, done: fresh };
      save(lesson, fresh);
      setDone(fresh);
    },
  };
}
