import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { ChipPin } from '../../sim';
import { formatSI } from '../../format';
import { PartStage, type StageHandle, type StageLabel } from '../stage/PartStage';
import { CommonTools, Shell } from '../stage/Shell';
import { usePart } from '../stage/usePart';
import { buildDevKitC } from './buildDevKitC';
import { DK_INFO, DK_PIECES } from './pieces';

/** What the ESP32 selected on the board is doing, once your pin model is written. */
export interface DevKitCLive {
  /** By Bench's pin id ("gpio2"). */
  readonly pins: Readonly<Record<string, ChipPin>>;
  readonly supplyAmps: number;
}

export interface DevKitCViewProps {
  readonly label: string | undefined;
  readonly note?: string;
  readonly live: DevKitCLive | undefined;
  readonly chooser?: ReactNode;
}

/** A pin's state in a few words, for its label: driving, reading, or nothing worth saying (undefined). */
function pinState(pin: ChipPin): string | undefined {
  if (pin.mode === 'output') return pin.high ? 'driving HIGH' : 'driving LOW';
  if (pin.floating && pin.mode === 'input') return undefined;
  if (pin.level === 'high') return 'HIGH';
  if (pin.level === 'low') return 'LOW';
  return pin.level === 'unknown' ? '?' : undefined;
}

/** The ESP32-DevKitC in 3D: its pins as on the real board, its module, and the chip under the can. */
export function DevKitCView({ label, note, live, chooser }: DevKitCViewProps) {
  const model = useMemo(() => buildDevKitC(), []);
  useEffect(() => () => {
    model.dispose();
  }, [model]);
  const stage = useRef<StageHandle>(null);
  const part = usePart(model, stage);

  const labels: StageLabel[] = [];
  if (!part.hidden.has('usb')) labels.push({ key: 'usb', anchor: model.anchors.usb, text: 'USB' });
  if (!part.hidden.has('frontHeader')) {
    labels.push({ key: 'v3', anchor: model.anchors.v3, text: '3V3' });
    labels.push({ key: 'gnd', anchor: model.anchors.gnd, text: 'GND' });
  }
  const active: string[] = [];
  for (const [pinId, pin] of Object.entries(live?.pins ?? {})) {
    const state = pinState(pin);
    if (!state || !Object.hasOwn(model.anchors, pinId)) continue;
    active.push(`GPIO${String(pin.gpio)} ${state}`);
    labels.push({ key: pinId, anchor: model.anchors[pinId], text: `GPIO${String(pin.gpio)} · ${state}` });
  }

  return (
    <Shell
      title={label ?? 'An ESP32 to look at'}
      subtitle="ESP32-DevKitC V4 · ESP32-WROOM-32E"
      hint={note ?? (label ? 'The one selected on your board.' : 'Not on your board: select an ESP32 there to link them.')}
      chooser={chooser}
      label="An ESP32 board in 3D."
      tools={
        <CommonTools
          apart={part.apart}
          onApart={() => {
            part.setApartTo(!part.apart);
          }}
          hiddenCount={part.hidden.size}
          onShowAll={part.showAll}
          onReset={part.reset}
        />
      }
      pieces={DK_PIECES}
      info={DK_INFO}
      selected={part.selected}
      onSelect={part.setSelected}
      onHover={part.setHovered}
      hidden={part.hidden}
      onToggleHidden={part.toggleHidden}
      cursor={part.hovered ? 'point' : ''}
      cardExtra={
        live &&
        (part.selected === 'chip' || part.selected === 'can' || part.selected === 'module') && (
          <p className="viewer-live">
            {active.length > 0 ? `Right now: ${active.join(', ')}.` : 'Right now: no pin set up by your program yet.'}
          </p>
        )
      }
      readout={
        <>
          <span>38 pins, 2.54 mm apart · 3.3 V logic</span>
          {live && <span>{`${formatSI(live.supplyAmps, 'A', { digits: 3 })} from its 3.3 V${active.length > 0 ? ` · ${active.join(' · ')}` : ''}`}</span>}
        </>
      }
      help="Drag to look around · scroll or pinch to zoom · click a piece, or pick it below"
    >
      <PartStage
        model={model}
        hidden={part.hidden}
        hovered={part.hovered}
        selected={part.selected}
        onHover={part.setHovered}
        onSelect={part.setSelected}
        labels={labels}
        handle={stage}
        shapeKey={String(part.apart)}
      />
    </Shell>
  );
}
