import { useState, type CSSProperties } from 'react';
import { useSession } from '../builder/session';
import { useLesson } from './progress';

/** The lesson: its goal, how far you've got, and what to do next. */
export function LessonPanel() {
  const progress = useLesson();
  const session = useSession();
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  if (!progress) return null;
  const toggle = (id: string) => {
    setOpened((before) => {
      const after = new Set(before);
      if (!after.delete(id)) after.add(id);
      return after;
    });
  };
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
          const open = state === 'current' || opened.has(step.id);
          const detailId = `step-${lesson.id}-${step.id}`;
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
                {state === 'current' ? (
                  <p className="step-title">{step.title}</p>
                ) : (
                  // Done and later steps fold away; open one to read it again, or to go back to it.
                  <button
                    type="button"
                    className="step-title step-toggle"
                    aria-expanded={open}
                    aria-controls={detailId}
                    onClick={() => {
                      toggle(step.id);
                    }}
                  >
                    <span>
                      {step.title}
                      {state === 'done' && <span className="visually-hidden"> (done)</span>}
                    </span>
                    <svg className="step-chevron" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M6 4l4 4-4 4" />
                    </svg>
                  </button>
                )}
                {open && (
                  <div id={detailId}>
                    <p className="step-detail">{step.detail}</p>
                    {state === 'done' && (
                      <>
                        <button
                          type="button"
                          className="link step-back"
                          onClick={() => {
                            progress.backTo(step.id);
                            toggle(step.id); // it's the current step now, open anyway; folded again once it's done
                          }}
                        >
                          Go back to this step
                        </button>
                        <p className="step-note">Your circuit is checked again from here: anything it still does ticks straight back.</p>
                      </>
                    )}
                  </div>
                )}
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
