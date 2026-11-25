import type { Method } from '@bench/engine';
import { useState } from 'react';

interface YourTurnProps {
  readonly part: string;
  readonly file: string;
  /** The methods still to write. */
  readonly methods: readonly Method[];
  /** Opens the part's code in the Code window. */
  readonly onOpen: () => void;
  /** Your home folder, when the code's kept there as a file (on the computer, not the phone). */
  readonly home: string | undefined;
}

const STILL_NEEDED: Readonly<Record<Method, string>> = {
  stamp: 'stamp(), so the solver knows how it behaves',
  current: 'current(), so the bench can read how much flows through it',
  settle: 'settle(), so it can heat up and burn out',
  read: 'read(), so a program can tell HIGH from LOW',
};

/** What each part file models, to name it in a sentence: "an LED", "a switch". */
const MODELS: Readonly<Record<string, readonly [withArticle: string, bare: string]>> = {
  led: ['an LED', 'LED'],
  switch: ['a switch', 'switch'],
  potentiometer: ['a knob', 'knob'],
  capacitor: ['a capacitor', 'capacitor'],
  transistor: ['a transistor', 'transistor'],
  gpio: ['a microcontroller’s pin', 'pin'],
  motor: ['a motor', 'motor'],
  driver: ['a motor driver', 'motor driver'],
};


/** Where a part's stamp() is written for you and calls jobs of yours, what to name instead of stamp(). */
const STAMP_JOBS: Readonly<Record<string, string>> = {
  transistor: 'diodes() and action(), the two jobs its stamp() calls, so the solver knows how it behaves',
  'motor driver': 'drive(), which its stamp() asks which way each output goes',
};

/** What waits on the jobs left, for a part something else waits on: a program can't run on a half-written pin. */
const WAITING: Readonly<Record<string, string>> = {
  pin: 'Your program runs once nothing’s left here.',
};

function modelOf(file: string): readonly [string, string] {
  const base = file.split('/').at(-1)?.replace(/\.ts$/, '') ?? file;
  return MODELS[base] ?? [`a ${base}`, base];
}

/** What's left to write in a part, and where. Shown inside a FloatingCard. */
export function YourTurn({ part, file, methods, onOpen, home }: YourTurnProps) {
  const [copied, setCopied] = useState(false);
  const started = !methods.includes('stamp');
  const [aModel, model] = modelOf(file);
  // Your copy, in your home folder: the same file the Code window edits.
  const base = file.split('/').at(-1) ?? file;
  const mine = home === undefined ? undefined : `${home.replaceAll('\\', '/')}/lessons/${base}`;

  const copy = () => {
    if (mine === undefined) return;
    void navigator.clipboard.writeText(mine).then(() => {
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1600);
    });
  };

  const open = (
    <button type="button" className="ghost" onClick={onOpen}>
      Open it in the Code window
    </button>
  );
  const path = mine !== undefined && (
    <>
      <code>{mine}</code>
      <button type="button" className="copy" onClick={copy}>
        {copied ? 'Copied' : 'Copy path'}
      </button>
    </>
  );

  if (started) {
    return (
      <>
        <p>It still needs:</p>
        <ul>
          {methods.map((method) => (
            <li key={method}>{(method === 'stamp' && STAMP_JOBS[model]) || STILL_NEEDED[method]}</li>
          ))}
        </ul>
        {WAITING[model] && <p>{WAITING[model]}</p>}
        <p className="path">{open}</p>
        {path && <p className="path">Or in your own editor: {path}</p>}
      </>
    );
  }

  return (
    <>
      <p>
        {`${part} is still a stub, so it isn’t in the circuit yet and nothing flows through it. Teach the engine how ${aModel} behaves and it comes alive here.`}
      </p>
      <ol>
        <li>{open}{path && <> or, in your own editor, {path}</>}</li>
        <li>
          Write it, job by job. <code>pnpm test:watch</code> checks each against the datasheet
        </li>
        <li>Save, and your {model} is in the circuit at once</li>
      </ol>
    </>
  );
}
