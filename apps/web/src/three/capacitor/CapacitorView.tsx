import { UVR_25V } from '@bench/engine';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CAPACITOR_VALUES } from '../../kinds/capacitor/model';
import { formatSI } from '../../format';
import { PartStage, type StageHandle, type StageLabel } from '../stage/PartStage';
import { CommonTools, Shell } from '../stage/Shell';
import { useTween } from '../stage/tween';
import { boxAt, usePart } from '../stage/usePart';
import { buildCapacitor } from './buildCapacitor';
import { CAP_INFO, CAP_PIECES } from './pieces';

/** The sizes on offer, µF: the same as the board's. */
type CapSize = (typeof CAPACITOR_VALUES)[number];

export interface CapacitorViewProps {
  readonly uf: CapSize;
  /** Changes the size, when this one isn't from the board (on the board, the Inspector does that). */
  readonly onUf?: (uf: CapSize) => void;
  readonly label: string | undefined;
  readonly note?: string;
  /** Volts it's holding, when it's the one selected on the board and your model is written. */
  readonly held: number | undefined;
  readonly chooser?: ReactNode;
}

/** How long unrolling (or rolling back up) takes, ms. */
const UNROLL_MS = 900;

/** A capacitor in 3D: take it apart, unroll its foil, and look at every piece. */
export function CapacitorView({ uf, onUf, label, note, held, chooser }: CapacitorViewProps) {
  const spec = UVR_25V[uf];
  const model = useMemo(() => buildCapacitor(spec), [spec]);
  useEffect(() => () => {
    model.dispose();
  }, [model]);
  const stage = useRef<StageHandle>(null);
  const part = usePart(model, stage);
  const [rolledOut, setRolledOut] = useState(false);
  const [unrolled, setUnrolled] = useState(false);
  const shown = useRef(false);
  const unroll = useTween(rolledOut ? 1 : 0, UNROLL_MS, (value) => {
    model.setUnroll(value);
    const out = value > 0.6;
    if (out !== shown.current) {
      shown.current = out;
      setUnrolled(out);
    }
  });
  // Another size: unrolled as far as the last one was.
  useEffect(() => {
    model.setUnroll(unroll.current);
  }, [model, unroll]);

  const toggleUnroll = () => {
    const on = !rolledOut;
    if (on && !part.apart) {
      // Out of the can first, then unrolled: frame where it'll end up.
      part.setApartTo(
        true,
        () => {
          model.setUnroll(1);
        },
        () => {
          model.setUnroll(unroll.current);
        },
      );
    } else {
      stage.current?.frame(
        boxAt(
          model,
          () => {
            model.setUnroll(on ? 1 : 0);
          },
          () => {
            model.setUnroll(unroll.current);
          },
        ),
      );
    }
    setRolledOut(on);
  };

  const labels: StageLabel[] = [];
  if (!part.hidden.has('plusLead')) labels.push({ key: 'plus', anchor: model.anchors.plus, text: '+' });
  if (!part.hidden.has('minusLead')) labels.push({ key: 'minus', anchor: model.anchors.minus, text: '−' });
  if (unrolled) {
    for (const [id, text] of [
      ['anode', 'anode foil (+)'],
      ['paper', 'paper + electrolyte'],
      ['cathode', 'cathode foil (−)'],
    ] as const) {
      if (!part.hidden.has(id)) labels.push({ key: id, anchor: model.anchors[`${id}End`], text });
    }
  }

  const selected = part.selected;
  const charge = held === undefined ? undefined : spec.farads * held;
  const sizeLine = `${String(uf)} µF · ${String(spec.ratedVolts)} V · ${String(spec.diameterMm)} × ${String(spec.lengthMm)} mm`;

  return (
    <Shell
      title={label ?? 'A capacitor to look at'}
      subtitle="Nichicon UVR · radial aluminium electrolytic"
      hint={note ?? (label ? 'The one selected on your board.' : 'Not on your board: select a capacitor there to link them.')}
      chooser={
        <>
          {chooser}
          {onUf && (
            <div className="viewer-sizes" role="group" aria-label="Size">
              {CAPACITOR_VALUES.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={size === uf ? 'chip on' : 'chip'}
                  aria-pressed={size === uf}
                  onClick={() => {
                    onUf(size);
                  }}
                >
                  {size} µF
                </button>
              ))}
            </div>
          )}
        </>
      }
      label="A capacitor in 3D."
      tools={
        <CommonTools
          apart={part.apart}
          onApart={() => {
            // Putting it back together rolls it back up first.
            if (part.apart && rolledOut) setRolledOut(false);
            part.setApartTo(
              !part.apart,
              () => {
                if (part.apart) model.setUnroll(0);
              },
              () => {
                model.setUnroll(unroll.current);
              },
            );
          }}
          hiddenCount={part.hidden.size}
          onShowAll={part.showAll}
          onReset={part.reset}
        >
          <button type="button" className={rolledOut ? 'chip on' : 'chip'} aria-pressed={rolledOut} onClick={toggleUnroll}>
            {rolledOut ? 'Roll it back up' : 'Unroll the foil'}
          </button>
        </CommonTools>
      }
      pieces={CAP_PIECES}
      info={CAP_INFO}
      selected={selected}
      onSelect={part.setSelected}
      onHover={part.setHovered}
      hidden={part.hidden}
      onToggleHidden={part.toggleHidden}
      cursor={part.hovered ? 'point' : ''}
      cardExtra={
        charge !== undefined &&
        held !== undefined &&
        (selected === 'anode' || selected === 'cathode' || selected === 'paper' || selected === 'roll') && (
          <p className="viewer-live">
            {`Holding ${formatSI(held, 'V')} right now: ${formatSI(Math.abs(charge), 'C', { digits: 3 })} of charge moved from one plate to the other (farads × volts).`}
          </p>
        )
      }
      readout={
        <>
          <span>{sizeLine}</span>
          {held !== undefined && <span>{`holding ${formatSI(held, 'V')} · ${formatSI(0.5 * spec.farads * held ** 2, 'J', { digits: 3 })} stored`}</span>}
        </>
      }
      help="Drag to look around · scroll or pinch to zoom · click a piece, or pick it below"
    >
      <PartStage
        model={model}
        hidden={part.hidden}
        hovered={part.hovered}
        selected={selected}
        onHover={part.setHovered}
        onSelect={part.setSelected}
        labels={labels}
        handle={stage}
        shapeKey={`${String(uf)} ${String(part.apart)} ${String(rolledOut)}`}
      />
    </Shell>
  );
}
