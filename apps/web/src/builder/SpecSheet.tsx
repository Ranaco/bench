import { formatSI } from '../format';
import type { Board, PlacedPart } from './board';
import { CATALOG } from './catalog';
import { size, type Selection } from './selection';
import { sheetFor, shown, SOURCES, type SpecSheet as Sheet } from './specs';

/** Why a selected thing has no sheet of its own. */
const NO_SHEET: Partial<Record<PlacedPart['kind'], string>> = {
  ground: 'Ground isn’t a part you buy: it’s the point every voltage is measured from, 0 V by definition.',
  junction: 'A junction is only where wires meet: one point, one voltage, nothing to rate.',
};

/** The selected part's spec sheet: the datasheet numbers Bench simulates it with, and where each comes from. */
export function SpecSheetPanel({ board, selection }: { readonly board: Board; readonly selection: Selection }) {
  const one = size(selection) === 1;
  const part = one ? board.parts.find((p) => p.id === selection.parts.at(0)) : undefined;
  const sheet = part && sheetFor(part.kind, part.props);

  if (part && sheet) return <PartSheet part={part} sheet={sheet} />;
  let message = 'Select a part to see its spec sheet: the numbers from its datasheet that Bench simulates it with.';
  if (part) message = NO_SHEET[part.kind] ?? message;
  else if (one && selection.wires.length === 1)
    message = 'A jumper wire’s resistance is worked out from copper, its thickness and its length: the Inspector shows it.';
  else if (selection.parts.length + selection.wires.length > 1) message = 'Select one part to see its spec sheet.';
  return (
    <section className="spec" aria-label="Spec sheet">
      <p className="inspector-empty">{message}</p>
    </section>
  );
}

function PartSheet({ part, sheet }: { readonly part: PlacedPart; readonly sheet: Sheet }) {
  return (
    <section className="spec" aria-labelledby="spec-model">
      <header className="spec-head">
        <p className="spec-eyebrow">
          {part.label} · {CATALOG[part.kind].name}
        </p>
        <h2 id="spec-model" className="spec-model">
          {sheet.model}
        </h2>
        <p className="spec-maker">
          {sheet.maker} · {sheet.description}
        </p>
        <p className="spec-doc">From: {sheet.document}</p>
      </header>

      {part.kind === 'resistor' && (
        <dl className="spec-fixed">
          <div>
            <dt>Resistance</dt>
            <dd>{formatSI(Number(part.props.ohms), 'Ω', { trim: true })}</dd>
          </div>
          <p>Its value, from the kit: pick another in the Inspector.</p>
        </dl>
      )}

      {sheet.sections.map((section) => (
        <section key={section.title} className="spec-section" aria-label={section.title}>
          <h3>{section.title}</h3>
          {section.fields.map((field) => (
            <div key={field.label} className="spec-row">
              <div className="spec-name">
                <span className="spec-label">
                  {field.label}
                  {field.symbol && <span className="spec-symbol">{field.symbol}</span>}
                </span>
                <span className="spec-note">{field.note}</span>
              </div>
              <div className="spec-value-cell">
                <span className="spec-value">
                  {shown(field)}
                  {field.unit && <span className="spec-unit">{field.unit}</span>}
                </span>
                <span className={`spec-chip ${field.source}`} title={SOURCES[field.source].meaning}>
                  {SOURCES[field.source].label}
                </span>
              </div>
            </div>
          ))}
        </section>
      ))}

      <details className="spec-legend">
        <summary>Where the numbers come from</summary>
        <dl>
          {Object.values(SOURCES).map((source) => (
            <div key={source.label}>
              <dt>{source.label}</dt>
              <dd>{source.meaning}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
