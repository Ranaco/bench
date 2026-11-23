import type { Method } from '@bench/engine';
import { useState } from 'react';

interface YourTurnProps {
  readonly part: string;
  readonly file: string;
  /** The methods still to write. */
  readonly methods: readonly Method[];
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
};


/** Where a part's stamp() is written for you and calls jobs of yours, what to name instead of stamp(). */
const STAMP_JOBS: Readonly<Record<string, string>> = {
  transistor: 'diodes() and action(), the two jobs its stamp() calls, so the solver knows how it behaves',
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
export function YourTurn({ part, file, methods }: YourTurnProps) {
  const [copied, setCopied] = useState(false);
  const started = !methods.includes('stamp');
  const [aModel, model] = modelOf(file);

  const copy = () => {
    void navigator.clipboard.writeText(file).then(() => {
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1600);
    });
  };

  const path = (
    <>
      <code>{file}</code>
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
        <p className="path">In {path}</p>
      </>
    );
  }

  return (
    <>
      <p>
        {`${part} is still a stub, so it isn’t in the circuit yet and nothing flows through it. Teach the engine how ${aModel} behaves and it comes alive here.`}
      </p>
      <ol>
        <li>Open {path}</li>
        <li>
          Run <code>pnpm test:watch</code> and make the {model} tests pass
        </li>
        <li>Save, and this page reloads with your {model} in the circuit</li>
      </ol>
    </>
  );
}
