import { adcReading, NotWrittenYet, TICK, type Circuit, type Esp32Model, type Readings } from '@bench/engine';
import type { ChipPin } from '../../sim/readings';
import { record } from '../capacitor/model';
import { defineKind } from '../kind';
import { ESP32_ADC, ESP32_BODY, ESP32_GPIOS, ESP32_PINS } from './board';

/** A pin's voltage over the last little while: what the Graph draws for an ESP32. */
export const PIN_TRACE_SECONDS = 5;

/** What happens to one ESP32's pins over time, by pin id ("gpio4"). */
interface ChipMemo {
  /** Each pin's recent voltage. */
  readonly traces: Map<string, { times: number[]; volts: number[] }>;
  /** Each pin's last level while reading, and how many times it's changed. */
  readonly changes: Map<string, { level: ChipPin['level']; changes: number }>;
  /** Each analog pin's lowest and highest analogRead() value seen. */
  readonly analogSeen: Map<string, [number, number]>;
}

/** What a part method gives, or undefined while it isn't written. */
export function attempt<T>(run: () => T): T | undefined {
  try {
    return run();
  } catch (error) {
    if (error instanceof NotWrittenYet) return undefined;
    throw error;
  }
}

/** A circuit's readings as they stand, for a part's own methods to read from. */
export function readingsOf(c: Circuit): Readings {
  return {
    time: c.time,
    dt: TICK,
    ambient: c.ambient,
    voltage: (node) => c.voltage(node),
    across: (a, b) => c.across(a, b),
    branchCurrent: () => 0,
  };
}

/**
 * Each of the board's GPIO pins as the circuit stands: its voltage against the chip's GND, the resistance holding it
 * there (all from one elimination), and whether nothing is: its 50 nA of leak could move it further than the supply.
 */
export function chipPins(chip: Esp32Model, c: Circuit) {
  const pins = ESP32_GPIOS.flatMap((p) => {
    const gpioPart = chip.pins.get(p.gpio);
    return gpioPart ? [{ ...p, gpioPart }] : [];
  });
  const ohmsOf = c.resistancesBetween(pins.map((p) => [p.gpioPart.pin, chip.gnd] as const));
  return pins.map((p, i) => {
    const ohms = ohmsOf[i] ?? Infinity;
    const { leakAmps, supplyVolts } = p.gpioPart.spec;
    return { ...p, volts: c.across(p.gpioPart.pin, chip.gnd), ohms, floating: leakAmps * ohms > supplyVolts };
  });
}

export const esp32 = defineKind<Esp32Model, ChipMemo>({
  kind: 'esp32',
  name: 'ESP32 board',
  tile: 'ESP32',
  blurb: 'An ESP32-DevKitC: a microcontroller that runs your program, powered from USB',
  pins: ESP32_PINS.map(({ id, name, x, y }) => ({ id, name, x, y })),
  box: { x: -ESP32_BODY.halfX - 20, y: -ESP32_BODY.halfY, width: 2 * ESP32_BODY.halfX + 40, height: 2 * ESP32_BODY.halfY },
  defaults: {},
  modules: ['esp32', 'gpio'],
  create: (label, nodes, _props, code) =>
    new code.esp32(
      label,
      nodes.v3,
      nodes.gnd,
      Object.fromEntries(ESP32_GPIOS.map((p) => [p.gpio, nodes[p.id]])),
      undefined,
      [nodes.gnd2],
      new Set(ESP32_GPIOS.filter((p) => p.inputOnly).map((p) => p.gpio)),
      code.gpio,
    ),
  memo: () => ({ traces: new Map(), changes: new Map(), analogSeen: new Map() }),
  /**
   * Its pins over time: each one's voltage, its level changes while reading, and its analog range. A floating pin's
   * voltage means nothing, so it leaves a gap in the trace and counts towards nothing.
   */
  track: ({ c, part, memo, failed }) => {
    if (failed) return;
    for (const { id, gpio: number, gpioPart: gpio, volts, ohms, floating } of chipPins(part, c)) {
      let trace = memo.traces.get(id);
      if (!trace) {
        trace = { times: [], volts: [] };
        memo.traces.set(id, trace);
      }
      record(trace, c.time, floating ? Number.NaN : volts, PIN_TRACE_SECONDS);
      if (gpio.mode !== 'output') {
        const level = attempt(() => gpio.read(volts, ohms));
        const seen = memo.changes.get(id) ?? { level: undefined, changes: 0 };
        const changed = level !== undefined && level !== 'unknown' && seen.level !== undefined && seen.level !== 'unknown' && level !== seen.level;
        memo.changes.set(id, { level, changes: seen.changes + (changed ? 1 : 0) });
      }
      const unit = ESP32_ADC[number];
      if (unit !== undefined && !floating) {
        const value = adcReading(volts, unit);
        const range = memo.analogSeen.get(id);
        memo.analogSeen.set(id, range ? [Math.min(range[0], value), Math.max(range[1], value)] : [value, value]);
      }
    }
  },
  trace: (memo, pinId) => (pinId === undefined ? undefined : memo.traces.get(pinId)),
  read: ({ c, part, memo, written, failed, amps, program }) => {
    const pins: Record<string, ChipPin> = {};
    let over = false;
    const readings = readingsOf(c);
    for (const { id, gpio: number, gpioPart: gpio, volts: measured, ohms, floating: adrift } of chipPins(part, c)) {
      const volts = failed ? 0 : measured;
      const floating = failed || adrift;
      const pinAmps = written && !failed ? attempt(() => gpio.current(readings)) : undefined;
      const spec = gpio.spec;
      const unit = ESP32_ADC[number];
      // Past the datasheet: more than its typical drive current, or (on a pin something's holding) a voltage outside
      // what a pin may be given. A floating pin's voltage means nothing, so it can't be over.
      const outside = !floating && (volts > spec.maxVolts || volts < -0.3);
      if ((pinAmps ?? 0) > spec.sourceAmps || (pinAmps ?? 0) < -spec.sinkAmps || outside) over = true;
      pins[id] = {
        gpio: number,
        mode: gpio.mode,
        high: gpio.high,
        level: written && !failed ? attempt(() => gpio.read(volts, ohms)) : undefined,
        volts,
        amps: pinAmps,
        changes: memo.changes.get(id)?.changes ?? 0,
        analogRange: memo.analogSeen.get(id),
        // Shown where the program reads it as a number; a pin it reads as HIGH or LOW needn't say.
        analog: unit === undefined || floating || !program?.analogPins.has(number) ? undefined : adcReading(volts, unit),
        floating,
      };
    }
    const supplyAmps = failed ? 0 : (amps ?? 0);
    const chip = { pins, supplyAmps, readout: failed ? undefined : program?.readout(pins, supplyAmps) };
    return { volts: failed ? 0 : c.across(part.vdd, part.gnd), over: written && over, chip };
  },
});
