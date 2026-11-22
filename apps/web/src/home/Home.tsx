import { useEffect, useRef, type CSSProperties } from 'react';
import { LESSONS } from '../lessons/lessons';
import { readProgress } from '../lessons/progress';
import { HREF } from '../routes';
import { useRoving } from './roving';

interface MenuItem {
  readonly href: string;
  readonly title: string;
  readonly detail: string;
}

/** The first lesson not yet finished, and how far into it you are. */
function nextLesson() {
  for (const lesson of LESSONS) {
    const done = readProgress(lesson).size;
    if (done < lesson.steps.length) return { lesson, done };
  }
  return undefined;
}

/** The main menu: carry on where you were, pick a lesson, or build freely. */
export function Home() {
  const next = nextLesson();
  const items: MenuItem[] = [
    ...(next
      ? [
          {
            href: HREF.lesson(next.lesson),
            title: next.done > 0 ? 'Continue' : 'Start',
            detail: `Lesson ${String(next.lesson.number)} · ${next.lesson.title}${next.done > 0 ? ` · ${String(next.done)} of ${String(next.lesson.steps.length)}` : ''}`,
          },
        ]
      : []),
    { href: HREF.lessons, title: 'Lessons', detail: 'Goals to reach, one step at a time' },
    { href: HREF.build, title: 'Build', detail: 'A free board with every part so far' },
  ];
  const roving = useRoving(items.length);
  const first = useRef<HTMLAnchorElement>(null);

  // Ready for Enter straight away, like a game's title screen.
  useEffect(() => {
    first.current?.focus();
  }, []);

  return (
    <main className="home">
      <div className="home-inner">
        <div className="home-brand">
          <span className="home-led" aria-hidden="true" />
          <h1>Bench</h1>
        </div>
        <p className="home-tagline">Build circuits from nothing, and make them work.</p>

        <nav className="home-menu" aria-label="Main menu" onKeyDown={roving.onKeyDown}>
          {items.map((item, i) => {
            const props = roving.item(i);
            return (
              <a
                key={item.title}
                href={item.href}
                className="home-item"
                style={{ '--i': i } as CSSProperties}
                {...props}
                ref={(element) => {
                  props.ref(element);
                  if (i === 0) first.current = element;
                }}
              >
                <span className="home-item-mark" aria-hidden="true" />
                <span className="home-item-title">{item.title}</span>
                <span className="home-item-detail">{item.detail}</span>
              </a>
            );
          })}
        </nav>

        <p className="home-hint">
          <kbd>↑</kbd> <kbd>↓</kbd> to choose · <kbd>Enter</kbd> to go
        </p>
      </div>
    </main>
  );
}
