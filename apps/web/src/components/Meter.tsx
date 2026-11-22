import { useEffect, useRef, useState } from 'react';
import { formatParts, formatSI } from '../format';
import { judge, parseGuess } from '../guess';
import type { GuessRecord } from '../builder/session';
import type { Measurement, MeterMode } from '../builder/meter';
import { Segmented } from './Segmented';

interface MeterProps {
  readonly mode: MeterMode;
  readonly onMode: (mode: MeterMode) => void;
  readonly measurement: Measurement | undefined;
  readonly prompt: string;
  readonly guessFirst: boolean;
  readonly record: GuessRecord | undefined;
  readonly onReveal: (key: string, record: GuessRecord) => void;
  readonly onForget: (key: string) => void;
}

const FLOOR = { V: 1e-6, A: 1e-9 } as const;

export function Meter(props: MeterProps) {
  const { mode, measurement, prompt, guessFirst, record } = props;
  const hidden = measurement !== undefined && guessFirst && !record;

  return (
    <section className="meter" aria-label="Multimeter">
      <Segmented
        label="Meter mode"
        options={[
          { value: 'volts', label: 'Volts', detail: 'voltmeter', shortcut: 'V' },
          { value: 'amps', label: 'Amps', detail: 'clamp meter', shortcut: 'A' },
        ]}
        value={mode}
        onChange={props.onMode}
      />

      <div className="display" aria-live="polite">
        {measurement && !hidden ? (
          <Reading value={measurement.value} unit={measurement.unit} />
        ) : (
          <output className="reading idle">{hidden ? '?' : '—'}</output>
        )}
        <p className="hint">{measurement ? measurement.what : prompt}</p>
      </div>

      {measurement && hidden && (
        <GuessForm
          key={measurement.key}
          measurement={measurement}
          onReveal={(guess) => {
            props.onReveal(measurement.key, { guess, actual: measurement.value });
          }}
        />
      )}

      {measurement && record && guessFirst && (
        <p className="verdict">
          {record.guess === undefined ? (
            'Measured without a guess. '
          ) : (
            <>
              You guessed {formatSI(record.guess, measurement.unit)}.{' '}
              <strong>{judge(record.guess, record.actual).words}.</strong>{' '}
            </>
          )}
          <button
            type="button"
            className="link"
            onClick={() => {
              props.onForget(measurement.key);
            }}
          >
            Guess again
          </button>
        </p>
      )}

      {mode === 'amps' && (
        <p className="aside">
          This is a clamp meter: it reads current through a wire without touching it. A regular multimeter has to be
          wired into the loop to measure current.
        </p>
      )}
    </section>
  );
}

function Reading({ value, unit }: { readonly value: number; readonly unit: 'V' | 'A' }) {
  const parts = formatParts(value, unit, { floor: FLOOR[unit] });
  return (
    <output className="reading">
      {parts.number} <span className="unit">{parts.unit}</span>
    </output>
  );
}

function GuessForm(props: { readonly measurement: Measurement; readonly onReveal: (guess: number | undefined) => void }) {
  const { measurement } = props;
  const [text, setText] = useState('');
  const parsed = parseGuess(text, measurement.unit);
  const invalid = text.trim() !== '' && parsed === undefined;
  const form = useRef<HTMLFormElement>(null);

  // A new reading waits for a guess: make sure the box to type it in is in view, whatever the window's size.
  useEffect(() => {
    form.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  return (
    <form
      ref={form}
      className="guess"
      onSubmit={(event) => {
        event.preventDefault();
        if (parsed !== undefined) props.onReveal(parsed);
      }}
    >
      <label htmlFor="guess">Your guess</label>
      <div className="guess-row">
        <input
          id="guess"
          inputMode="decimal"
          autoComplete="off"
          placeholder={measurement.unit === 'V' ? 'e.g. 2 V' : 'e.g. 20 mA'}
          value={text}
          aria-invalid={invalid}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        <button type="submit" disabled={parsed === undefined}>
          Measure
        </button>
      </div>
      <button
        type="button"
        className="link"
        onClick={() => {
          props.onReveal(undefined);
        }}
      >
        Just measure
      </button>
    </form>
  );
}
