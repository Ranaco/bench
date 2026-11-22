import type { CSSProperties } from 'react';
import { useSession } from '../builder/session';
import { useLesson } from './progress';

/** The lesson: its goal, how far you've got, and what to do next. */
export function LessonPanel() {
  const progress = useLesson();
  const session = useSession();
  if (!progress) return null;
  const { lesson, done, current } = progress;
  const count = lesson.steps.length;
  const fill = { '--done': done.size / count } as CSSProperties;

  return (
    <section className="lesson" aria-labelledby="lesson-title">
      <p className="lesson-eyebrow">Lesson {lesson.number}</p>
      <h2 id="lesson-title" className="lesson-title">
        {lesson.title}
      </h2>
      <p className="lesson-goal">{lesson.goal}</p>

      <div className="lesson-progress" style={fill}>
        <span className="lesson-bar" aria-hidden="true">
          <span />
        </span>
        <span className="lesson-count">
          {done.size} of {count}
        </span>
      </div>

      <ol className="steps">
        {lesson.steps.map((step, i) => {
          const state = done.has(step.id) ? 'done' : step === current ? 'current' : 'later';
          return (
            <li key={step.id} className={`step ${state}`} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="step-mark" aria-hidden="true">
                {state === 'done' ? (
                  <svg viewBox="0 0 16 16">
                    <path d="M4 8.5l2.5 2.5L12 5.5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <div className="step-text">
                <p className="step-title">
                  {step.title}
                  {state === 'done' && <span className="visually-hidden"> (done)</span>}
                </p>
                {state === 'current' && <p className="step-detail">{step.detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {!current && (
        <div className="lesson-done" role="status">
          <p className="lesson-done-title">Lesson {lesson.number} done.</p>
          <p>{lesson.outro}</p>
          <p className="lesson-next">
            <a href="#/build">Open Build</a>
            <a href="#/lessons">All lessons</a>
          </p>
        </div>
      )}

      <button
        type="button"
        className="link"
        onClick={() => {
          session.clear();
          progress.restart();
        }}
      >
        Start this lesson over
      </button>
    </section>
  );
}
