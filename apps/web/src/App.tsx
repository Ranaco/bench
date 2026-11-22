import { TopNav } from './components/TopNav';
import { Home } from './home/Home';
import { LessonSelect } from './home/LessonSelect';
import { HREF, useScreen } from './routes';
import { Workspace } from './workspace/Workspace';

export function App() {
  const screen = useScreen();
  switch (screen.kind) {
    case 'home':
      return <Home />;
    case 'lessons':
      return <LessonSelect />;
    case 'lesson': {
      const { lesson } = screen;
      const nav = (
        <TopNav
          trail={[
            { label: 'Bench', href: HREF.home },
            { label: 'Lessons', href: HREF.lessons },
            { label: `${String(lesson.number)} · ${lesson.title}` },
          ]}
        />
      );
      // Keyed: each lesson has its own board, history and progress.
      return <Workspace key={lesson.id} lesson={lesson} nav={nav} />;
    }
    case 'build':
      return <Workspace key="build" lesson={undefined} nav={<TopNav trail={[{ label: 'Bench', href: HREF.home }, { label: 'Build' }]} />} />;
  }
}
