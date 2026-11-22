import type { CSSProperties } from 'react';

interface Option<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly detail?: string;
  /** Keyboard shortcut, shown as a tooltip. */
  readonly shortcut?: string;
}

interface SegmentedProps<T extends string> {
  readonly label: string;
  readonly options: readonly Option<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}

/** A row of mutually exclusive choices with a thumb that slides to the chosen one. */
export function Segmented<T extends string>({ label, options, value, onChange }: SegmentedProps<T>) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const style = { '--count': options.length, '--index': index } as CSSProperties;
  return (
    <div className="segmented" role="radiogroup" aria-label={label} style={style}>
      <span className="segmented-thumb" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          aria-keyshortcuts={option.shortcut}
          title={option.shortcut ? `${option.label} (${option.shortcut})` : undefined}
          onClick={() => {
            onChange(option.value);
          }}
        >
          <span>{option.label}</span>
          {option.detail && <small>{option.detail}</small>}
        </button>
      ))}
    </div>
  );
}
