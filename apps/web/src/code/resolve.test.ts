/** Which code the parts run: a project's own source, then the base, for a project and for a lesson. */
import { DEFAULTS } from '@bench/engine';
import { describe, expect, it } from 'vitest';
import { ledLoop, partOf, run } from '../builder/fixtures';
import { BoardSim } from '../sim';
import { build, chooseAll, choose, NO_FILES, type CodeFiles, type CodeScope } from './resolve';
import { LESSON_MODULES } from './sources';

const LED = 'export class Led { readonly mine = true; }';
const files = (over: Partial<CodeFiles>): CodeFiles => ({ ...NO_FILES, ...over });
const project: CodeScope = { project: { slug: 'night-light' } };
const finished = () => true;
const unfinished = () => false;

describe('Which code a part runs', () => {
  it('in a project, every part runs Bench’s default: written, whether or not its lesson is done', () => {
    const yours = files({ lessons: new Map([['led', LED]]) });
    expect(choose('led', project, yours, finished)).toEqual({ origin: 'default', source: undefined });
    expect(choose('led', project, yours, unfinished)).toEqual({ origin: 'default', source: undefined });
    // A first visit: no lesson started, nothing of yours written.
    for (const module of Object.keys(LESSON_MODULES) as (keyof typeof LESSON_MODULES)[]) {
      expect(choose(module, project, NO_FILES, unfinished), module).toEqual({ origin: 'default', source: undefined });
    }
  });

  it('a first visit’s project runs: an LED loop in Build carries its 22 mA, with no lesson done', () => {
    const code = build(chooseAll(project, NO_FILES, unfinished)).code;
    const loop = ledLoop(330);
    const sim = new BoardSim(undefined, () => code);
    sim.sync(loop.board);
    run(sim, 1);
    expect(partOf(sim, loop.led).amps).toBeCloseTo(0.022, 3);
  });

  it('in another lesson, your lesson code while its lesson isn’t finished, or the stub before you’ve written any', () => {
    const yours = choose('led', { lesson: 'a-knob' }, files({ lessons: new Map([['led', LED]]) }), unfinished);
    expect(yours.origin).toBe('lesson');
    expect(yours.source?.text).toBe(LED);
    expect(yours.source?.file).toBe('lessons/led.ts');
    expect(choose('led', { lesson: 'a-knob' }, NO_FILES, unfinished).source?.text).toContain('NotWrittenYet');
  });

  it('always your lesson code inside its own lesson, finished or not', () => {
    expect(choose('led', { lesson: 'light-an-led' }, files({ lessons: new Map([['led', LED]]) }), finished).origin).toBe('lesson');
    expect(choose('led', { lesson: 'a-knob' }, files({ lessons: new Map([['led', LED]]) }), finished).origin).toBe('default');
  });

  it('a project’s own source, over the base, whatever the base is', () => {
    const own = files({ project: new Map([['led', LED]]), lessons: new Map([['led', 'export class Led {}']]) });
    const expected = { origin: 'project', source: { text: LED, file: 'projects/night-light/parts/led.ts' } };
    expect(choose('led', project, own, finished)).toEqual(expected);
    expect(choose('led', project, own, unfinished)).toEqual(expected);
  });

  it('a lesson has no project: a project’s source is never read there', () => {
    expect(choose('led', { lesson: 'a-knob' }, files({ project: new Map([['led', LED]]) }), finished).origin).toBe('default');
  });

  it('builds a set where only the broken module is broken: the rest run', () => {
    const broken = { text: 'export class Led { x = ; }', file: 'lessons/led.ts' };
    const chosenAll = Object.fromEntries(
      (Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]).map((m) => [m, m === 'led' ? { origin: 'lesson', source: broken } : { origin: 'default', source: undefined }]),
    ) as Parameters<typeof build>[0];
    const built = build(chosenAll);
    expect(built.errors.get('led')?.message).toMatch(/lessons\/led\.ts/);
    expect(built.code.resistor).toBe(DEFAULTS.resistor);
    expect(() => new built.code.led('D1', 1 as never, 2 as never)).toThrow(/lessons\/led\.ts/);
  });
});
