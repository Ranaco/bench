import { useEffect, useRef, type CSSProperties } from 'react';
import { COMING, LESSONS } from '../lessons/lessons';
import { isFinished, readProgress } from '../lessons/progress';
import { HREF } from '../routes';
import { useRoving } from './roving';

/** Every lesson, how far you've got in each, and the ones still to come. Esc goes back to the menu. */
export function LessonSelect() {
  const roving = useRoving(LESSONS.length);
  const first = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    first.current?.focus();
    const back = (event: KeyboardEvent) => {
      if (event.key === 'Escape') window.location.hash = HREF.home;
    };
    window.addEventListener('keydown', back);
    return () => {
      window.removeEventListener('keydown', back);
    };
  }, []);

  return (
    <main className="home">
      <div className="home-inner wide">
        <a className="back" href={HREF.home}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3.5L5.5 8l4.5 4.5" />
          </svg>
          Menu
        </a>
        <h1 className="screen-title">Lessons</h1>

        <ol className="lesson-list" onKeyDown={roving.onKeyDown}>
          {LESSONS.map((lesson, i) => {
            const done = readProgress(lesson).size;
            const total = lesson.steps.length;
            const finished = isFinished(lesson);
            const props = roving.item(i);
            return (
              <li key={lesson.id} style={{ '--i': i } as CSSProperties}>
                <a
                  href={HREF.lesson(lesson)}
                  className="lesson-card"
                  {...props}
                  ref={(element) => {
                    props.ref(element);
                    if (i === 0) first.current = element;
                  }}
                >
                  <span className="lesson-number">{lesson.number}</span>
                  <span className="lesson-card-title">{lesson.title}</span>
                  <span className="lesson-card-goal">{lesson.goal}</span>
                  <span className="lesson-card-status">
                    {finished ? (
                      <>
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                          <path d="M4 8.5l2.5 2.5L12 5.5" />
                        </svg>
                        Done
                      </>
                    ) : done > 0 ? (
                      `${String(done)} of ${String(total)}`
                    ) : (
                      'Start'
                    )}
                  </span>
                  {done > 0 && !finished && (
                    <span className="lesson-card-bar" aria-hidden="true">
                      <span style={{ '--done': done / total } as CSSProperties} />
                    </span>
                  )}
                </a>
              </li>
            );
          })}
          {COMING.map((lesson, i) => (
            <li key={lesson.number} style={{ '--i': LESSONS.length + i } as CSSProperties}>
              <div className="lesson-card locked" aria-disabled="true">
                <span className="lesson-number">{lesson.number}</span>
                <span className="lesson-card-title">{lesson.title}</span>
                <span className="lesson-card-goal">{lesson.blurb}</span>
                <span className="lesson-card-status">
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M4.5 7.5h7v6h-7z M6 7.5V5.5a2 2 0 0 1 4 0v2" />
                  </svg>
                  Coming
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
