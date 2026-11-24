import { PN2222A } from '@bench/engine';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TransistorState } from '../../sim';
import { formatSI } from '../../format';
import { PartStage, type StageHandle, type StageLabel } from '../stage/PartStage';
import { CommonTools, Shell } from '../stage/Shell';
import { boxAt, usePart } from '../stage/usePart';
import { buildTransistor } from './buildTransistor';
import { Q_INFO, Q_PIECES, type QPiece } from './pieces';

/** What the transistor selected on the board is doing, once your model is written. */
export interface TransistorLive {
  readonly baseAmps: number;
  /** Undefined while its current() isn't written. */
  readonly collectorAmps: number | undefined;
  readonly state: TransistorState | undefined;
}

export interface TransistorViewProps {
  readonly label: string | undefined;
  readonly note?: string;
  readonly live: TransistorLive | undefined;
  readonly chooser?: ReactNode;
}

const LAYER_PIECES: readonly QPiece[] = ['emitterLayer', 'baseLayer', 'collectorLayer'];
const CASE_PIECES = Q_PIECES.filter((id) => !LAYER_PIECES.includes(id));

const STATE: Readonly<Record<TransistorState, string>> = {
  off: 'off',
  amplifying: 'amplifying',
  on: 'switched fully on',
};

/** A transistor in 3D: take it apart, look at its chip, and its chip's layers. */
export function TransistorView({ label, note, live, chooser }: TransistorViewProps) {
  const model = useMemo(() => buildTransistor(), []);
  useEffect(() => () => {
    model.dispose();
  }, [model]);
  const stage = useRef<StageHandle>(null);
  const part = usePart(model, stage);
  const [layers, setLayers] = useState(false);

  const toggleLayers = () => {
    const on = !layers;
    stage.current?.frame(
      boxAt(
        model,
        () => {
          model.setLayers(on);
        },
        () => {
          model.setLayers(layers);
        },
      ),
    );
    model.setLayers(on);
    setLayers(on);
    if (!on && part.selected && LAYER_PIECES.includes(part.selected)) part.setSelected(undefined);
  };

  const labels: StageLabel[] = [];
  for (const [id, key, text] of [
    ['emitterLeg', 'emitter', 'E'],
    ['baseLeg', 'base', 'B'],
    ['collectorLeg', 'collector', 'C'],
  ] as const) {
    if (!part.hidden.has(id)) labels.push({ key, anchor: model.anchors[key], text });
  }
  if (layers) {
    for (const [id, text] of [
      ['emitterLayer', 'emitter (N)'],
      ['baseLayer', 'base (P), thin'],
      ['collectorLayer', 'collector (N)'],
    ] as const) {
      if (!part.hidden.has(id)) labels.push({ key: id, anchor: model.anchors[id], text });
    }
  }

  const selected = part.selected;
  const collector = live?.collectorAmps;
  const flowing =
    live &&
    collector !== undefined &&
    `${formatSI(live.baseAmps, 'A', { digits: 3 })} into the base lets ${formatSI(collector, 'A', { digits: 3 })} through, collector to emitter`;

  return (
    <Shell
      title={label ?? 'A transistor to look at'}
      subtitle="PN2222A · NPN · TO-92"
      hint={note ?? (label ? 'The one selected on your board.' : 'Not on your board: select a transistor there to link them.')}
      chooser={chooser}
      label="A transistor in 3D."
      tools={
        <CommonTools
          apart={part.apart}
          onApart={() => {
            part.setApartTo(!part.apart);
          }}
          hiddenCount={part.hidden.size}
          onShowAll={part.showAll}
          onReset={part.reset}
        >
          <button type="button" className={layers ? 'chip on' : 'chip'} aria-pressed={layers} onClick={toggleLayers}>
            {layers ? 'Hide the chip’s layers' : 'Show the chip’s layers'}
          </button>
        </CommonTools>
      }
      pieces={layers ? Q_PIECES : CASE_PIECES}
      info={Q_INFO}
      selected={selected}
      onSelect={part.setSelected}
      onHover={part.setHovered}
      hidden={part.hidden}
      onToggleHidden={part.toggleHidden}
      cursor={part.hovered ? 'point' : ''}
      cardExtra={
        flowing && (selected === 'chip' || (selected !== undefined && LAYER_PIECES.includes(selected))) && (
          <p className="viewer-live">{`Right now: ${flowing}${live.state ? `. It’s ${STATE[live.state]}.` : '.'}`}</p>
        )
      }
      readout={
        <>
          <span>{`legs E B C, ${String(PN2222A.forwardGain)}× gain, up to ${formatSI(PN2222A.maxCollectorAmps, 'A', { trim: true })}`}</span>
          {live && (
            <span>
              {`base ${formatSI(live.baseAmps, 'A', { digits: 3 })} · collector ${collector === undefined ? '—' : formatSI(collector, 'A', { digits: 3 })}${live.state ? ` · ${STATE[live.state]}` : ''}`}
            </span>
          )}
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
        shapeKey={`${String(part.apart)} ${String(layers)}`}
      />
    </Shell>
  );
}
