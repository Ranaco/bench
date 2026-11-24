/**
 * The Inspector's numbers as a multimeter shows them. While a program switches pins faster than anyone could read,
 * every part's current, voltage and power (and every pin's voltage) is shown as its average since the last readout,
 * as a meter's display does, rather than jumping between on and off every frame.
 */
import type { Readout } from '@bench/engine';
import type { LivePart, LiveWire } from './live';
import type { MeterReadout } from './readings';

/**
 * How often the Inspector's numbers change while something's switching, in circuit time: 4 times a second, each the
 * average since the last, as a multimeter's display does (Fluke 87V: "Digital: 6000 counts, updates 4/sec"). Redrawn
 * every frame instead, a pin a program switches every few milliseconds flickers between HIGH and LOW too fast to read.
 */
export const READOUT_SECONDS = 0.25;

/** The averages in `readout`, by part, wire and pin id, for the parts and wires on the board. */
export function meterReadout(
  readout: Readout,
  parts: ReadonlyMap<string, LivePart>,
  wires: ReadonlyMap<string, LiveWire>,
): MeterReadout {
  const shownParts: Record<string, { amps: number; volts: number; watts: number }> = {};
  const pins: Record<string, number> = {};
  for (const [id, live] of parts) {
    for (const [pin, node] of Object.entries(live.nodes)) {
      const volts = readout.volts(node);
      if (volts !== undefined) pins[`${id}.${pin}`] = volts;
    }
    const amps = readout.amps.get(live.part);
    const watts = readout.watts.get(live.part);
    const nodes = Object.values(live.nodes);
    const first = nodes.at(0);
    const second = nodes.at(1);
    const from = first === undefined ? undefined : readout.volts(first);
    const to = second === undefined ? undefined : readout.volts(second);
    // A part whose current() isn't written has no average: it's shown as it is now.
    if (amps === undefined || watts === undefined) continue;
    shownParts[id] = { amps, watts, volts: from === undefined || to === undefined ? 0 : from - to };
  }
  const shownWires: Record<string, number> = {};
  for (const [id, live] of wires) {
    const amps = readout.amps.get(live.wire);
    if (amps !== undefined) shownWires[id] = amps;
  }
  return { parts: shownParts, wires: shownWires, pins };
}
