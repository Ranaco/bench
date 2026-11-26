import { Fragment, useRef, useState } from 'react';

/** One step of the trail: a link back, the page you're on, or (with `onRename`) a name you can click to change. */
export interface Crumb {
  readonly label: string;
  readonly href?: string;
  /** Makes the label a button that turns into a text box; called with the new name on Enter or clicking away. */
  readonly onRename?: (name: string) => void;
  /** The longest the name may be. */
  readonly maxLength?: number;
}

/** The workspace header's trail back to the menu: Bench / Lessons / 1 · Light an LED. */
export function TopNav({ trail }: { readonly trail: readonly Crumb[] }) {
  return (
    <nav className="title crumbs" aria-label="Where you are">
      {trail.map((step, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="crumb-gap" aria-hidden="true">
              /
            </span>
          )}
          {step.href ? (
            <a href={step.href} className={i === 0 ? 'brand' : undefined}>
              {step.label}
            </a>
          ) : step.onRename ? (
            <Renameable label={step.label} onRename={step.onRename} maxLength={step.maxLength} />
          ) : (
            <span aria-current="page">{step.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

/** A name that's a button until clicked, then a text box: Enter or clicking away keeps it, Esc puts it back. */
function Renameable({ label, onRename, maxLength }: { readonly label: string; readonly onRename: (name: string) => void; readonly maxLength?: number }) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  // Enter or Esc has already decided: the blur that may follow as the box goes away mustn't decide again.
  const settled = useRef(false);
  if (draft === undefined) {
    return (
      <button
        type="button"
        className="crumb-name"
        aria-current="page"
        title="Rename"
        onClick={() => {
          settled.current = false;
          setDraft(label);
        }}
      >
        {label}
      </button>
    );
  }
  const finish = (keep: boolean) => {
    if (settled.current) return;
    settled.current = true;
    if (keep && draft.trim() !== '' && draft.trim() !== label) onRename(draft);
    setDraft(undefined);
  };
  return (
    <input
      className="crumb-input"
      aria-label="Board name"
      value={draft}
      maxLength={maxLength}
      size={Math.max(8, draft.length)}
      autoFocus
      onFocus={(event) => {
        event.currentTarget.select();
      }}
      onChange={(event) => {
        setDraft(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish(true);
        else if (event.key === 'Escape') finish(false);
      }}
      onBlur={() => {
        finish(true);
      }}
    />
  );
}
