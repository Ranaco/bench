import { ENERGIZER_522, ESP32_GPIO, FAULHABER_1516_009SR, PN2222A, RED_LED, TB6612FNG, VISHAY_1N4007 } from '@bench/engine';
import { netsOf, type Board, type PartKind, type PinRef, type PlacedPart } from '../builder/board';
import { CATALOG } from '../builder/catalog';
import { supplyFor } from '../kinds/battery/model';
import type { MeterState } from '../builder/meter';
import type { BoardSnapshot, ChipPin, PartReading } from '../sim';
import { formatSI } from '../format';
import { GLOW_AMPS } from '../kit';

/**
 * Lessons are data: which parts they unlock, and the steps to get through.
 * Each step is a check on the live circuit, so it passes because the physics
 * says so, not because parts sit in particular places or carry particular names.
 */

/** What a step looks at: the board as built, what the circuit is doing right now, and where the meter's leads are. */
export interface LessonState {
  readonly board: Board;
  readonly snapshot: BoardSnapshot;
  readonly meter: MeterState;
}

export interface Step {
  readonly id: string;
  readonly title: string;
  /** What to do, or why it matters. */
  readonly detail: string;
  readonly passes: (state: LessonState) => boolean;
}

export interface Lesson {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly goal: string;
  readonly parts: readonly PartKind[];
  /** Done in order: only the first unfinished step is checked, and a step stays done once passed. */
  readonly steps: readonly Step[];
  /** Said once every step is done: what you've learnt, and what to try next. */
  readonly outro: string;
}

const has = (board: Board, kind: PartKind) => board.parts.some((p) => p.kind === kind);

/** Readings of every LED on the board that's in the circuit and still alive. */
function liveLeds({ board, snapshot }: LessonState): PartReading[] {
  return board.parts.flatMap((part) => {
    const reading = snapshot.parts[part.id];
    return part.kind === 'led' && reading?.written && !reading.burnt ? [reading] : [];
  });
}


const ma = (amps: number) => formatSI(amps, 'A', { trim: true });

export const LIGHT_AN_LED: Lesson = {
  id: 'light-an-led',
  number: 1,
  title: 'Light an LED',
  goal: 'Build the circuit that lights an LED without cooking it, then cook one on purpose.',
  parts: ['battery', 'resistor', 'led', 'ground'],
  steps: [
    {
      id: 'battery',
      title: 'Put a battery on the board',
      detail: 'Drag it in from Parts. It pushes current out of its + terminal and takes it back in at −.',
      passes: ({ board }) => has(board, 'battery'),
    },
    {
      id: 'parts',
      title: 'Add a resistor and an LED',
      detail: 'The LED makes light. The resistor is there to hold its current back.',
      passes: ({ board }) => has(board, 'resistor') && has(board, 'led'),
    },
    {
      id: 'glow',
      title: 'Wire a loop that lights the LED',
      detail:
        'Battery + to the resistor, the resistor to the LED’s anode (+), the LED’s cathode (−) back to the battery’s −. Current only flows around a closed loop, and only one way through an LED.',
      passes: (state) => liveLeds(state).some((led) => (led.amps ?? 0) >= GLOW_AMPS),
    },
    {
      id: 'rated',
      title: `Run it between ${ma(RED_LED.typicalAmps)} and ${ma(RED_LED.maxAmps)}`,
      detail: `Its datasheet tests it at ${ma(RED_LED.typicalAmps)} and allows ${ma(RED_LED.maxAmps)} at most. Try resistor values until the current lands in between. Click the LED to read it.`,
      passes: (state) =>
        liveLeds(state).some((led) => (led.amps ?? 0) >= RED_LED.typicalAmps && (led.amps ?? 0) <= RED_LED.maxAmps),
    },
    {
      id: 'ground',
      title: 'Ground it',
      detail:
        'Wire a ground to the battery’s −. Now every voltage is measured from there: hover any pin to read it.',
      passes: ({ snapshot }) => snapshot.grounded,
    },
    {
      id: 'burn',
      title: 'Burn one out, on purpose',
      detail: `Pick a smaller resistor and watch the LED’s temperature climb. Past ${String(RED_LED.maxJunctionCelsius)} °C inside, it dies.`,
      passes: ({ board, snapshot }) => board.parts.some((p) => p.kind === 'led' && snapshot.parts[p.id]?.burnt),
    },
    {
      id: 'replace',
      title: 'Replace it, and light it safely again',
      detail: 'Click Replace on the dead LED, and put the resistor back to one that keeps it within its rating.',
      passes: (state) =>
        liveLeds(state).some((led) => (led.amps ?? 0) >= RED_LED.typicalAmps && (led.amps ?? 0) <= RED_LED.maxAmps),
    },
  ],
  outro:
    'You built it from nothing, ran it at its rating, and found its limit. Build mode has every part so far, with no goals: try two LEDs in series, then in parallel, and guess each current first.',
};

const lit = (state: LessonState) => liveLeds(state).some((led) => (led.amps ?? 0) >= GLOW_AMPS);

const ofKind = (board: Board, kind: PartKind) => board.parts.filter((p) => p.kind === kind);

/** Enough current through a switch or button that it's the one lighting the LED. */
const carrying = ({ snapshot }: LessonState, part: PlacedPart) => Math.abs(snapshot.parts[part.id]?.amps ?? 0) >= GLOW_AMPS;

const held = ({ snapshot }: LessonState, part: PlacedPart) => snapshot.parts[part.id]?.closed === true;

const isWired = (board: Board, ref: PinRef) =>
  board.wires.some((w) => (w.a.part === ref.part && w.a.pin === ref.pin) || (w.b.part === ref.part && w.b.pin === ref.pin));

/** The side a slide switch isn't slid to: the open one. */
const openSide = (part: PlacedPart) => (part.props.side === 'b' ? 'a' : 'b');

const pinsOf = (part: PlacedPart): PinRef[] => CATALOG[part.kind].pins.map((pin) => ({ part: part.id, pin: pin.id }));

/** Two parts with a pin each wired together and to nothing else: one after the other, in series. */
function inSeries(board: Board, x: PlacedPart, y: PlacedPart): boolean {
  const net = netsOf(board);
  // Any other part's pin on the point where they meet would be a branch, so not series.
  const others = board.parts.filter((p) => p.kind !== 'junction' && p.id !== x.id && p.id !== y.id).flatMap(pinsOf);
  return pinsOf(x).some((px) => pinsOf(y).some((py) => net(px) === net(py) && !others.some((o) => net(o) === net(px))));
}

/** Two two-pin parts across the same two points: side by side, in parallel. */
function inParallel(board: Board, x: PlacedPart, y: PlacedPart): boolean {
  const net = netsOf(board);
  const [xa, xb] = [net({ part: x.id, pin: 'a' }), net({ part: x.id, pin: 'b' })];
  const [ya, yb] = [net({ part: y.id, pin: 'a' }), net({ part: y.id, pin: 'b' })];
  return xa !== xb && ((xa === ya && xb === yb) || (xa === yb && xb === ya));
}

/** Every pair of different items from a list. */
function pairs<T>(items: readonly T[]): (readonly [T, T])[] {
  return items.flatMap((x, i) => items.slice(i + 1).map((y) => [x, y] as const));
}

export const SWITCHES_AND_BUTTONS: Lesson = {
  id: 'switches-and-buttons',
  number: 2,
  title: 'Switches and buttons',
  goal: 'Turn the LED on and off with a switch, then with buttons: one, both, or either.',
  parts: ['battery', 'resistor', 'led', 'switch', 'button', 'ground'],
  steps: [
    {
      id: 'loop',
      title: 'Light the LED through a slide switch',
      detail:
        'The loop from lesson 1, with a switch in the way: one wire to its middle pin (common), one from side A. The lever shows which side common is touching.',
      passes: (state) => lit(state) && ofKind(state.board, 'switch').some((sw) => carrying(state, sw)),
    },
    {
      id: 'off',
      title: 'Switch it off',
      detail: 'Click the lever. Common slides to the other side, the loop is broken, and the LED goes dark.',
      passes: (state) =>
        liveLeds(state).length > 0 &&
        !lit(state) &&
        ofKind(state.board, 'switch').some(
          (sw) => isWired(state.board, { part: sw.id, pin: 'common' }) && isWired(state.board, { part: sw.id, pin: openSide(sw) }),
        ),
    },
    {
      id: 'gap',
      title: 'Measure across the gap',
      detail:
        'Set the meter to Volts. Red lead on common, black on the side it isn’t touching. Most of the battery’s push is waiting there, held back by the plastic between the contacts.',
      passes: ({ board, meter }) => {
        const { red, black } = meter.leads;
        if (meter.mode !== 'volts' || red?.kind !== 'pin' || black?.kind !== 'pin' || red.pin.part !== black.pin.part) return false;
        const sw = ofKind(board, 'switch').find((p) => p.id === red.pin.part);
        if (!sw || !isWired(board, { part: sw.id, pin: openSide(sw) })) return false;
        return [red.pin.pin, black.pin.pin].sort().join() === ['common', openSide(sw)].sort().join();
      },
    },
    {
      id: 'button',
      title: 'Swap in a push button',
      detail:
        'Put a push button in the loop instead of the switch, and hold its cap down. The LED lights only while you hold it: let go and the button springs back up.',
      passes: (state) => lit(state) && ofKind(state.board, 'button').some((b) => held(state, b) && carrying(state, b)),
    },
    {
      id: 'and',
      title: 'Two buttons in a row: both or nothing',
      detail:
        'Wire two buttons one after the other (in series): one’s right pin to the other’s left. The current has to get through both, so both have to be down. With a mouse, right-click one and choose Hold down; on a touchscreen, use two fingers.',
      passes: (state) =>
        lit(state) &&
        pairs(ofKind(state.board, 'button')).some(
          ([x, y]) => inSeries(state.board, x, y) && [x, y].every((b) => held(state, b) && carrying(state, b)),
        ),
    },
    {
      id: 'or',
      title: 'Two buttons side by side: either one',
      detail:
        'Now wire two buttons side by side (in parallel): both left pins to one point, both right pins to another. The current can take either path, so either button lights it on its own.',
      passes: (state) =>
        lit(state) &&
        pairs(ofKind(state.board, 'button')).some(([x, y]) => {
          if (!inParallel(state.board, x, y)) return false;
          const down = [x, y].filter((b) => held(state, b));
          return down.length === 1 && carrying(state, down[0]);
        }),
    },
  ],
  outro:
    'That’s the three ways a circuit decides: on or off, both (AND) and either (OR). Later, a microcontroller reads these same buttons and decides in code. Build mode has every part so far, with no goals.',
};

/** A knob wired across a battery: one end pin on each terminal, so its whole track carries the battery's push. */
interface Divider {
  readonly knob: PlacedPart;
  readonly battery: PlacedPart;
  /** The knob's end pin on the battery's +, and the one on its −. */
  readonly plusEnd: 'a' | 'b';
  readonly minusEnd: 'a' | 'b';
}

function dividers(board: Board): Divider[] {
  const net = netsOf(board);
  return ofKind(board, 'battery').flatMap((battery) => {
    const plus = net({ part: battery.id, pin: 'plus' });
    const minus = net({ part: battery.id, pin: 'minus' });
    return ofKind(board, 'knob').flatMap((knob): Divider[] => {
      const a = net({ part: knob.id, pin: 'a' });
      const b = net({ part: knob.id, pin: 'b' });
      if (a === plus && b === minus) return [{ knob, battery, plusEnd: 'a', minusEnd: 'b' }];
      if (a === minus && b === plus) return [{ knob, battery, plusEnd: 'b', minusEnd: 'a' }];
      return [];
    });
  });
}

/** How much of the push across a divider's knob is on its wiper, from the − end: 0 at the bottom, 1 at the top. */
function wiperShare({ snapshot }: LessonState, d: Divider): number | undefined {
  if (!snapshot.parts[d.knob.id]?.written) return undefined;
  const at = (pin: string) => snapshot.pins[`${d.knob.id}.${pin}`] ?? 0;
  const span = at(d.plusEnd) - at(d.minusEnd);
  return span > 0 ? (at('wiper') - at(d.minusEnd)) / span : undefined;
}

const shareIs = (state: LessonState, accept: (share: number) => boolean) =>
  dividers(state.board).some((d) => {
    const share = wiperShare(state, d);
    return share !== undefined && accept(share);
  });

export const A_KNOB: Lesson = {
  id: 'a-knob',
  number: 3,
  title: 'A knob',
  goal: 'Turn a knob to split the battery’s voltage, then to dim an LED.',
  parts: ['battery', 'resistor', 'led', 'knob', 'ground'],
  steps: [
    {
      id: 'across',
      title: 'Put the knob across the battery',
      detail:
        'Wire its two outer pins, 1 and 3, to the battery’s + and −. A small current now runs along its whole track, 10 kΩ from end to end.',
      passes: (state) => dividers(state.board).some((d) => state.snapshot.parts[d.knob.id]?.written === true),
    },
    {
      id: 'wiper',
      title: 'Measure the wiper',
      detail:
        'Set the meter to Volts. Red lead on the wiper, the middle pin; black on the battery’s −, or any pin wired to it. Then turn the knob: drag its dial, or use the slider in the Inspector.',
      passes: ({ board, meter }) => {
        const { red, black } = meter.leads;
        if (meter.mode !== 'volts' || red?.kind !== 'pin' || black?.kind !== 'pin' || red.pin.pin !== 'wiper') return false;
        const net = netsOf(board);
        return dividers(board).some(
          (d) => d.knob.id === red.pin.part && net(black.pin) === net({ part: d.battery.id, pin: 'minus' }),
        );
      },
    },
    {
      id: 'bottom',
      title: 'Turn it all the way down',
      detail:
        'Turn it towards the end wired to −, until the wiper reads as little as it can. It won’t quite reach 0 V: the datasheet allows up to 500 Ω left at each end of the track, so a little of the battery stays on the wiper.',
      passes: (state) => shareIs(state, (share) => share <= 0.1),
    },
    {
      id: 'half',
      title: 'Set it to half the battery',
      detail:
        'Turn it until the wiper reads half the battery’s voltage. The two legs of the track now share the battery’s push equally: that’s a voltage divider. It’s how a microcontroller will read a knob, a few lessons on.',
      passes: (state) => shareIs(state, (share) => share >= 0.45 && share <= 0.55),
    },
    {
      id: 'dimmer',
      title: 'Dim an LED with it',
      detail:
        'Now run the LED’s loop through the knob: battery +, a resistor, pin 1, the wiper, the LED, back to −. Turning the knob adds or takes away resistance, so the LED dims and brightens. Keep the resistor: Bench’s knob keeps 500 Ω at its ends, the most its datasheet allows, but a real one may keep almost nothing, and then the resistor is all that protects the LED.',
      passes: (state) => {
        const leds = liveLeds(state);
        if (!lit(state) || leds.some((led) => (led.amps ?? 0) > RED_LED.maxAmps)) return false;
        const knobs = ofKind(state.board, 'knob').map((k) => state.snapshot.parts[k.id]);
        if (knobs.some((k) => k?.over)) return false;
        const throughWiper = knobs.some((k) => Math.abs(k?.knob?.wiperAmps ?? 0) >= GLOW_AMPS);
        return throughWiper && ofKind(state.board, 'resistor').some((r) => carrying(state, r));
      },
    },
  ],
  outro:
    'A knob splits a voltage wherever you set it (a divider), or adds a resistance you can change (a dimmer). Next, capacitors: a part that stores charge, so things happen over time. Build mode has the knob too.',
};

/** Each capacitor that's in the circuit, with what it's holding and how fast that's changing. */
function capacitors({ board, snapshot }: LessonState) {
  return ofKind(board, 'capacitor').flatMap((part) => {
    const reading = snapshot.parts[part.id];
    return reading?.written && reading.capacitor ? [{ part, ...reading.capacitor }] : [];
  });
}

/**
 * Climbing by less than this share of its voltage per second counts as full for the circuit it's in: a big resistor
 * fills it slowly, and its own leak then stops it short of the battery's voltage, so "nearly the battery" may never
 * come. At 0.5 % a second it's within about 1 % of where it's heading, whatever the resistor (for R × C up to 2 s;
 * slower ones stop climbing that much before they're quite as close).
 */
const SETTLED_RATE = 0.005;

/** The biggest battery on the board, V with nothing connected, or undefined when there isn't one. */
function biggestBattery(board: Board): number | undefined {
  const volts = ofKind(board, 'battery').map((b) => supplyFor(b.props.supply).volts);
  return volts.length > 0 ? Math.max(...volts) : undefined;
}

/**
 * Filled to at least `share` of the biggest battery's voltage, the right way round, or as full as its circuit will
 * get it: holding at least a volt and no longer climbing.
 */
function chargedTo(state: LessonState, share: number): boolean {
  const supply = biggestBattery(state.board);
  if (supply === undefined) return false;
  return capacitors(state).some(
    (c) => c.held >= share * supply || (c.held >= 1 && c.rising !== undefined && Math.abs(c.rising) < SETTLED_RATE * c.held),
  );
}

/**
 * Seconds the batteries have to stay quiet before they count as unplugged: long enough that a battery merely between
 * two pulses of current doesn't pass for one taken out.
 */
const UNPLUGGED_SECONDS = 0.5;
/** How long Lesson 4's last step wants an LED kept glowing on one charge, s. */
const GLOW_SECONDS = 3;

/** An LED glowing from a capacitor alone, without going over its rating, with a resistor in its loop. */
function glowingFromCapacitor(state: LessonState, seconds: number): boolean {
  const unpowered = state.snapshot.unpowered;
  if (unpowered < UNPLUGGED_SECONDS || unpowered < seconds) return false;
  // Glowing that long, and never past its rating since it lit: a rush through too small a resistor doesn't count
  // once it's died down.
  const glowing = liveLeds(state).some((led) => (led.glowing ?? -1) >= seconds && (led.peakAmps ?? 0) <= RED_LED.maxAmps);
  return glowing && ofKind(state.board, 'resistor').some((r) => carrying(state, r));
}

export const CAPACITORS: Lesson = {
  id: 'capacitors',
  number: 4,
  title: 'Capacitors',
  goal: 'Fill a capacitor, unplug the battery, and light an LED with the charge it kept.',
  parts: ['battery', 'resistor', 'led', 'switch', 'capacitor', 'ground'],
  steps: [
    {
      id: 'charge',
      title: 'Charge a capacitor',
      detail:
        'Wire a loop: the battery’s +, a 1 kΩ resistor, the capacitor’s + leg, its − leg, back to the battery’s −. It only works one way round: + towards +. Then watch it fill in the Graph window (the tab beside the Inspector): fast at first, then slower and slower.',
      passes: (state) => chargedTo(state, 0.5),
    },
    {
      id: 'full',
      title: 'Measure it nearly full',
      detail:
        'Set the meter to Volts: red on the capacitor’s +, black on its −, or pins wired to them. Wait until it reads nearly the battery’s voltage, or stops climbing. It never quite gets all the way: the fuller it is, the less push is left to fill it. Through a big resistor it’s slower still, and its own small leak stops it a little short.',
      passes: (state) => {
        const { red, black } = state.meter.leads;
        if (state.meter.mode !== 'volts' || red?.kind !== 'pin' || black?.kind !== 'pin') return false;
        const net = netsOf(state.board);
        const across = capacitors(state).some(
          (c) => net(red.pin) === net({ part: c.part.id, pin: 'plus' }) && net(black.pin) === net({ part: c.part.id, pin: 'minus' }),
        );
        return across && chargedTo(state, 0.9);
      },
    },
    {
      id: 'hold',
      title: 'Unplug the battery',
      detail:
        'Take a wire off the battery, or delete it. The capacitor keeps its charge: the meter still reads it. It isn’t perfect: at the most its datasheet allows, it leaks away two-thirds of its voltage every 100 seconds.',
      passes: (state) => state.snapshot.unpowered >= UNPLUGGED_SECONDS && capacitors(state).some((c) => c.held >= 1),
    },
    {
      id: 'glow',
      title: 'Light an LED with it',
      detail:
        'With the battery still unplugged, wire a 330 Ω resistor and an LED across the capacitor: its + to the resistor, the resistor to the LED’s anode, the LED’s cathode back to its −. The LED lights, then fades as the charge runs out. To fill it again in one click, use a slide switch: common to the capacitor’s +, side A to the battery’s resistor, side B to the LED’s. Slide to A to fill it, to B to light the LED from it.',
      passes: (state) => glowingFromCapacitor(state, 0),
    },
    {
      id: 'longer',
      title: `Keep it glowing for ${String(GLOW_SECONDS)} seconds`,
      detail: `Make one charge keep the LED glowing for ${String(GLOW_SECONDS)} seconds: fill it all the way first, with nothing else drawing on it. A bigger capacitor holds more charge; a bigger resistor lets it out more slowly. Guess which you’d change, then try (below 330 Ω, the LED gets more than its 30 mA at first).`,
      passes: (state) => glowingFromCapacitor(state, GLOW_SECONDS),
    },
  ],
  outro:
    'A capacitor fills and empties along the same curve: fast at first, then slower and slower. How fast is set by resistance × capacitance: through 1 kΩ, 1000 µF gets 63 % of the way in 1 second. More resistance or more capacitance, and everything takes longer. Next, transistors: a small current switching a big one. Build mode has capacitors too.',
};

/** Each transistor that's in the circuit, with what it's doing. */
function transistors({ board, snapshot }: LessonState) {
  return ofKind(board, 'transistor').flatMap((part) => {
    const reading = snapshot.parts[part.id];
    return reading?.written && reading.transistor ? [{ part, ...reading.transistor }] : [];
  });
}

/**
 * A lit LED carrying a transistor's collector current: in its collector's path. Within 2 %, to allow for the
 * picoamps the solver leaks to ground at every node and nothing else.
 */
const litByCollector = (state: LessonState, collectorAmps: number | undefined) =>
  collectorAmps !== undefined &&
  collectorAmps >= GLOW_AMPS &&
  liveLeds(state).some((led) => Math.abs((led.amps ?? 0) - collectorAmps) <= 0.02 * collectorAmps);

/**
 * A transistor whose base is fed from a knob's wiper: the knob across the battery, and what leaves its wiper is
 * what goes into the base (within 2 %, the same allowance as above).
 */
function fedByKnob(state: LessonState, baseAmps: number): boolean {
  return dividers(state.board).some((d) => {
    const wiper = state.snapshot.parts[d.knob.id]?.knob?.wiperAmps;
    return wiper !== undefined && baseAmps > 0 && Math.abs(Math.abs(wiper) - baseAmps) <= 0.02 * baseAmps;
  });
}

/** At least this many times more out of the collector than into the base, for "a small current switching a big one". */
const SWITCH_GAIN = 10;

export const TRANSISTORS: Lesson = {
  id: 'transistors',
  number: 5,
  title: 'Transistors',
  goal: 'Switch an LED with a current too small to light it, then dim it smoothly: a transistor switching, then amplifying.',
  parts: ['battery', 'resistor', 'led', 'button', 'knob', 'transistor', 'ground'],
  steps: [
    {
      id: 'collector',
      title: 'Put the LED on the collector',
      detail:
        'Battery + to a 330 Ω resistor, the resistor to the LED’s anode, the LED’s cathode to the transistor’s collector (C), and its emitter (E, the leg with the arrow) to the battery’s −. Leave the base (B) unconnected. The LED stays dark: with nothing going into the base, the transistor holds back most of the battery’s push.',
      passes: (state) => {
        const battery = biggestBattery(state.board);
        return (
          battery !== undefined &&
          liveLeds(state).length > 0 &&
          transistors(state).some((q) => q.state === 'off' && q.collectorVolts >= battery / 2)
        );
      },
    },
    {
      id: 'switch',
      title: 'Switch it on through the base',
      detail:
        'Battery + to a push button, the button to a 10 kΩ resistor, the resistor to the base. Hold the button down: under a milliamp goes into the base, and the LED lights with about 25 times that. A current too small to light the LED switches on one that can.',
      passes: (state) =>
        ofKind(state.board, 'button').some((b) => held(state, b)) &&
        transistors(state).some(
          (q) =>
            q.state === 'on' && litByCollector(state, q.collectorAmps) && (q.collectorAmps ?? 0) >= SWITCH_GAIN * q.baseAmps,
        ),
    },
    {
      id: 'measure',
      title: 'Measure what goes into the base',
      detail:
        'Set the meter to Amps and close the clamp round the wire into the base, holding the button. Then move it to the wire into the collector and compare. The Inspector shows both, and collector ÷ base.',
      passes: (state) => {
        const clamp = state.meter.leads.clamp;
        if (state.meter.mode !== 'amps' || clamp?.kind !== 'wire') return false;
        const amps = Math.abs(state.snapshot.wires[clamp.wire]?.amps ?? 0);
        return transistors(state).some((q) => q.state !== 'off' && Math.abs(amps - q.baseAmps) <= 0.02 * q.baseAmps);
      },
    },
    {
      id: 'dimmer',
      title: 'Make it a dimmer with the knob',
      detail:
        'Take out the button and its 10 kΩ. Put the knob’s two end pins across the battery, and its wiper through a 47 kΩ resistor to the base. Turn it low: now the base current follows the knob, and the LED’s current follows the base’s, about 256 times bigger. That’s amplifying.',
      passes: (state) =>
        transistors(state).some((q) => q.state === 'amplifying' && fedByKnob(state, q.baseAmps) && litByCollector(state, q.collectorAmps)),
    },
    {
      id: 'full',
      title: 'Turn it up until it’s fully on',
      detail: `Turn the knob up. The LED brightens until the transistor is switched fully on: past that, more base current changes nothing, because the 330 Ω and the LED set the current, not the transistor. About ${ma(0.1e-3)} into the base is enough.`,
      passes: (state) =>
        transistors(state).some((q) => q.state === 'on' && fedByKnob(state, q.baseAmps) && litByCollector(state, q.collectorAmps)),
    },
  ],
  outro: `A transistor amplifies: the current into its base lets one about ${String(Math.round(PN2222A.forwardGain))} times bigger flow from collector to emitter, until the rest of the circuit can’t give any more. Then it’s a switch, fully on. That’s how a microcontroller pin, good for a few milliamps, will run a motor. Next, a microcontroller. Build mode has the transistor too.`,
};

/** Each ESP32 in the circuit (your pin model written), with its pins by id. */
function chips({ board, snapshot }: LessonState) {
  return ofKind(board, 'esp32').flatMap((part) => {
    const reading = snapshot.parts[part.id];
    return reading?.written && reading.chip ? [{ part, pins: Object.entries(reading.chip.pins) }] : [];
  });
}

/** Any ESP32 pin, with its chip and id, that passes `test`. */
const anyChipPin = (state: LessonState, test: (pin: ChipPin, pinId: string, chip: PlacedPart) => boolean) =>
  chips(state).some(({ part, pins }) => pins.some(([pinId, pin]) => test(pin, pinId, part)));

/** A knob's wiper wired to this pin of the chip. */
function wiperOn(board: Board, chip: PlacedPart, pinId: string): boolean {
  const net = netsOf(board);
  const at = net({ part: chip.id, pin: pinId });
  return ofKind(board, 'knob').some((knob) => net({ part: knob.id, pin: 'wiper' }) === at);
}

/** A transistor's base fed from an ESP32 pin driving HIGH: the pin's current is the base's (within 2 %). */
const fedByChip = (state: LessonState, baseAmps: number) =>
  baseAmps > 0 &&
  anyChipPin(state, (pin) => pin.mode === 'output' && pin.high && pin.amps !== undefined && Math.abs(pin.amps - baseAmps) <= 0.02 * baseAmps);

/** How far the knob has to be turned, in analogRead() counts, for the knob step: most of the way across 0–4095. */
const KNOB_SPAN = 3000;

export const MICROCONTROLLER: Lesson = {
  id: 'microcontroller',
  number: 6,
  title: 'A microcontroller',
  goal: 'Program an ESP32: blink an LED, read a button and the knob, then switch the LED through your transistor.',
  parts: ['battery', 'resistor', 'led', 'button', 'knob', 'transistor', 'esp32', 'ground'],
  steps: [
    {
      id: 'power',
      title: 'Power it, and measure its 3.3 V',
      detail:
        'Put an ESP32 on the board. It runs off USB, so it needs no battery. Set the meter to Volts, red lead on 3V3, black on GND. Every pin works between those two: near 3.3 V reads HIGH, near 0 V reads LOW.',
      passes: ({ board, meter, snapshot }) => {
        const { red, black } = meter.leads;
        if (meter.mode !== 'volts' || red?.kind !== 'pin' || black?.kind !== 'pin' || red.pin.part !== black.pin.part) return false;
        const chip = ofKind(board, 'esp32').find((p) => p.id === red.pin.part);
        return (
          chip !== undefined &&
          snapshot.parts[chip.id]?.written === true &&
          red.pin.pin === 'v3' &&
          (black.pin.pin === 'gnd' || black.pin.pin === 'gnd2')
        );
      },
    },
    {
      id: 'blink',
      title: 'Blink an LED from your program',
      detail:
        'Wire GPIO2 to a 330 Ω resistor, the resistor to an LED’s anode, its cathode to GND. In the ESP32’s program (select it, then Edit program): pinMode(2, OUTPUT) in setup(); in loop(), digitalWrite(2, HIGH), await delay(500), digitalWrite(2, LOW), await delay(500). Save, and it blinks: your first program, running.',
      passes: (state) => anyChipPin(state, (pin) => pin.mode === 'output') && liveLeds(state).some((led) => (led.flips ?? 0) >= 3),
    },
    {
      id: 'float',
      title: 'Read a button, and watch it float',
      detail:
        'Wire a push button between 3V3 and GPIO4. In setup(): pinMode(4, INPUT); in loop(): Serial.println(digitalRead(4)), then await delay(200). Pressed, it reads HIGH. Let go, nothing holds GPIO4 to anything, so it floats: the Inspector shows “?”, and the Serial Monitor warns that a real chip could read either.',
      passes: ({ snapshot }) => (snapshot.program?.floating.length ?? 0) > 0,
    },
    {
      id: 'pull',
      title: 'Hold it down with a pull-down',
      detail:
        'Change INPUT to INPUT_PULLDOWN. The chip’s own 45 kΩ resistor now holds GPIO4 to GND, so it reads LOW until you press the button, and HIGH while you hold it. Press it twice.',
      passes: (state) => anyChipPin(state, (pin) => (pin.mode === 'pulldown' || pin.mode === 'pullup') && pin.changes >= 3),
    },
    {
      id: 'knob',
      title: 'Read the knob as a number',
      detail:
        'Wire the knob’s two end pins to 3V3 and GND, and its wiper to GPIO34. In loop(): Serial.println(analogRead(34)), then await delay(200). Turn it from one end to the other: the number runs from 0 to 4095, the chip measuring the wiper’s voltage.',
      passes: (state) =>
        anyChipPin(
          state,
          (pin, pinId, chip) =>
            pin.analogRange !== undefined && pin.analogRange[1] - pin.analogRange[0] >= KNOB_SPAN && wiperOn(state.board, chip, pinId),
        ),
    },
    {
      id: 'drive',
      title: 'Switch a bigger load through your transistor',
      detail: `A pin gives about ${ma(ESP32_GPIO.sourceAmps)} at most, and a motor needs far more. So let a pin drive your transistor: GPIO5 → 10 kΩ → base, emitter → GND. For the load, the 9 V battery → 330 Ω → LED → collector, and the battery’s − to the ESP32’s GND: the two circuits must share a ground. Blink GPIO5 from your program.`,
      passes: (state) =>
        transistors(state).some((q) => q.state === 'on' && litByCollector(state, q.collectorAmps) && fedByChip(state, q.baseAmps)),
    },
  ],
  outro:
    'A microcontroller reads the world as HIGH, LOW or a number, and answers through its pins: a few milliamps each, so a transistor does the heavy lifting. Next, motors: a transistor switching something that fights back. Build mode has the ESP32 too.',
};


/** Each motor that's in the circuit, with what it's doing. */
function motors({ board, snapshot }: LessonState) {
  return ofKind(board, 'motor').flatMap((part) => {
    const reading = snapshot.parts[part.id];
    return reading?.written && reading.motor ? [{ part, amps: reading.amps ?? 0, volts: reading.volts, ...reading.motor }] : [];
  });
}

/**
 * Its current is what's left of the volts across it after its back-EMF, through its winding (to 5 %): it pushes back.
 * One that doesn't draws all its volts allow, however fast it turns.
 */
const pushesBack = (m: { readonly volts: number; readonly backEmf: number; readonly amps: number }) =>
  Math.abs(m.volts - m.backEmf - m.amps * MOTOR.ohms) <= 0.05 * Math.abs(m.volts);

const MOTOR = FAULHABER_1516_009SR;

/** Held still on the 9 V battery: only the winding and the battery's own resistance hold the current back. */
const STALL_AMPS = ENERGIZER_522.volts / (MOTOR.ohms + ENERGIZER_522.ohms);

/** Turning at least this fast counts as up to speed: three quarters of what its datasheet gives with nothing on it. */
const UP_TO_SPEED = 0.75 * MOTOR.noLoadRpm;

/** A diode across a motor, the right way round to catch its kick: its band (cathode) to the motor's +. */
function diodeAcrossMotor(board: Board): boolean {
  const net = netsOf(board);
  return ofKind(board, 'diode').some((diode) =>
    ofKind(board, 'motor').some(
      (motor) =>
        net({ part: diode.id, pin: 'cathode' }) === net({ part: motor.id, pin: 'plus' }) &&
        net({ part: diode.id, pin: 'anode' }) === net({ part: motor.id, pin: 'minus' }),
    ),
  );
}

/** A motor carrying a transistor's collector current (within 2 %, as for an LED). */
const motorOnCollector = (state: LessonState, collectorAmps: number | undefined) =>
  collectorAmps !== undefined && collectorAmps > 0 && motors(state).some((m) => Math.abs(m.amps - collectorAmps) <= 0.02 * collectorAmps);

const volts = (v: number) => formatSI(v, 'V', { trim: true });

export const MOTORS: Lesson = {
  id: 'motors',
  number: 7,
  title: 'Motors',
  goal: 'Spin a motor, feel it fight back, switch it from your program, catch the kick it gives, and slow it with PWM.',
  parts: ['battery', 'resistor', 'led', 'button', 'knob', 'transistor', 'diode', 'motor', 'esp32', 'ground'],
  steps: [
    {
      id: 'spin',
      title: 'Spin it from the battery',
      detail: `Wire the 9 V battery’s + to the motor’s +, and the motor’s − back to the battery’s −. Select it: turning freely, it draws only about ${ma(MOTOR.noLoadAmps)}. Guess before the next step: held still, will it draw more, or less?`,
      // Up to speed on a running motor's current, pushing back: one that doesn't yet only runs away, and on a small enough
      // current (through a resistor, or from a pin) it passes the speed with little current too.
      passes: (state) =>
        motors(state).some((m) => !m.held && Math.abs(m.rpm) >= UP_TO_SPEED && Math.abs(m.amps) <= 2 * MOTOR.noLoadAmps && pushesBack(m)),
    },
    {
      id: 'hold',
      title: 'Hold its shaft',
      detail: `Press and hold the middle of the motor (or Hold its shaft, in the Inspector). Its current jumps back up, to about ${ma(STALL_AMPS)}: the battery’s ${volts(ENERGIZER_522.volts)} over the motor’s ${String(MOTOR.ohms)} Ω winding and the battery’s own ${String(ENERGIZER_522.ohms)} Ω. Turning, a motor is also a generator: it makes a voltage of its own (“Pushing back as it turns”), and only what’s left over drives current. Held still, there’s none, and everything it draws turns to heat: more than the ${ma(MOTOR.ratedAmps)} it can carry for long. Let go, and it’s back up to speed in a fraction of a second.`,
      passes: (state) => motors(state).some((m) => m.held && m.amps >= 0.75 * STALL_AMPS),
    },
    {
      id: 'switch',
      title: 'Switch it from your program',
      detail: `As in Lesson 6: GPIO5 → 1 kΩ → the transistor’s base, its emitter → GND. The motor goes where the LED was: battery + → motor + → motor − → collector, and the battery’s − to the ESP32’s GND. Use 1 kΩ, not 10 kΩ: starting, the motor wants ${ma(STALL_AMPS)}, and through 10 kΩ the base gets too little for its gain of about ${String(Math.round(PN2222A.forwardGain))} to let that much through. In your program, turn GPIO5 on for a second and off for a second, over and over.`,
      passes: (state) =>
        transistors(state).some((q) => q.state === 'on' && motorOnCollector(state, q.collectorAmps) && fedByChip(state, q.baseAmps)),
    },
    {
      id: 'kick',
      title: 'Meet the kick',
      detail: `Select the transistor and watch “Highest in the last second” as GPIO5 goes LOW. A coil’s current can’t stop at once: switched off, the motor’s winding pushes the collector up until something gives. Here that’s the transistor itself, breaking down at its ${volts(PN2222A.maxCollectorVolts)} rating, and the warning shows. It’s over in about a millionth of a second, far too fast to see any other way.`,
      passes: (state) => motors(state).length > 0 && transistors(state).some((q) => (q.highestVolts ?? 0) > PN2222A.maxCollectorVolts),
    },
    {
      id: 'catch',
      title: 'Catch it with a diode',
      detail: `Put a diode across the motor, its band (the cathode) to the motor’s +. It points the wrong way to carry anything while the motor runs. Switched off, the winding’s current goes round through it instead, and the collector stops just above the battery, a diode’s drop over it. A ${String(VISHAY_1N4007.ratedAmps)} A 1N4007 is the usual one.`,
      passes: (state) => {
        const battery = biggestBattery(state.board);
        return (
          battery !== undefined &&
          diodeAcrossMotor(state.board) &&
          transistors(state).some((q) => q.highestVolts !== undefined && q.highestVolts > battery && q.highestVolts < PN2222A.maxCollectorVolts)
        );
      },
    },
    {
      id: 'speed',
      title: 'Slow it down with PWM',
      detail:
        'Your dimmer from Lesson 6, on GPIO5: on for 5 ms, off for 5 ms, over and over. Guess first: half on, so half speed? Try it. Then find an on and off that really slows it, to under three quarters of full speed. (The diode stays: it catches a kick a hundred times a second now.)',
      // Settled there, averaged through the ripple: a motor speeding up from rest passes through the range on its way.
      passes: (state) =>
        state.snapshot.readout !== undefined &&
        motors(state).some((m) => {
          const rpm = Math.abs(m.averageRpm ?? 0);
          return !m.held && m.steady && rpm >= 0.1 * MOTOR.noLoadRpm && rpm <= 0.75 * MOTOR.noLoadRpm;
        }),
    },
  ],
  outro:
    'A motor is a resistor, a coil and a generator in one: it draws most starting and held still, least running free, and its coil kicks when switched off, so a diode goes across it. With nothing to turn, it coasts through PWM’s off-time, so half on is nearly full speed: it only slows once the on-time can barely keep up with its friction. Next, direction: a motor driver that runs it both ways, and stops it two ways. Build mode has the motor and diode too.',
};

/** Each motor driver that's in the circuit, with what it reads. */
function drivers({ board, snapshot }: LessonState) {
  return ofKind(board, 'driver').flatMap((part) => {
    const reading = snapshot.parts[part.id];
    return reading?.written && reading.driver ? [{ part, ...reading.driver }] : [];
  });
}

/** Each motor wired across a driver's channel (its two pins on that channel's two outputs), with the channel. */
function driven(state: LessonState) {
  const net = netsOf(state.board);
  return drivers(state).flatMap((driver) =>
    (['a', 'b'] as const).flatMap((side, index) => {
      const outputs = [net({ part: driver.part.id, pin: `${side}o1` }), net({ part: driver.part.id, pin: `${side}o2` })];
      return motors(state)
        .filter((m) => {
          const ends = [net({ part: m.part.id, pin: 'plus' }), net({ part: m.part.id, pin: 'minus' })];
          return ends[0] !== ends[1] && ends.every((end) => outputs.includes(end));
        })
        .map((motor) => ({ driver, channel: driver.channels[index === 0 ? 0 : 1], motor }));
    }),
  );
}

/** Still turning, enough to watch it stop: a hundred rpm. */
const TURNING_RPM = 100;

export const DIRECTION: Lesson = {
  id: 'direction',
  number: 8,
  title: 'Direction',
  goal: 'Run a motor both ways through a driver chip, stop it two ways, and see why braking makes PWM work at last.',
  parts: ['battery', 'resistor', 'led', 'button', 'transistor', 'diode', 'motor', 'driver', 'esp32', 'ground'],
  steps: [
    {
      id: 'wire',
      title: 'Wire up the driver',
      detail: `Put a Motor driver on the board. Its left side talks to the ESP32: VCC to 3V3, GND to GND, and STBY to 3V3 for now (HIGH: awake). Its right side runs the motor: VM to the 9 V battery’s +, the motor across AO1 and AO2, and its other GND to the battery’s −. Select it: its logic is yours to write, and the Your turn card has the jobs. Job 1 is enough to begin.`,
      passes: (state) =>
        driven(state).some(({ driver }) => driver.powered && driver.awake && driver.motorVolts >= TB6612FNG.minMotorVolts),
    },
    {
      id: 'forward',
      title: 'Forward',
      detail:
        'Wire three GPIOs to AIN1, AIN2 and PWMA (GPIO21, 19 and 18 will do). In your program: AIN1 HIGH, AIN2 LOW, PWMA HIGH. The chip switches AO1 to the battery and AO2 to ground, and the motor gets the whole 9 V, less half an ohm of switches.',
      passes: (state) =>
        driven(state).some(({ channel, motor }) => channel.mode === 'forward' && Math.abs(motor.rpm) >= UP_TO_SPEED && pushesBack(motor)),
    },
    {
      id: 'backwards',
      title: 'Backwards',
      detail:
        'Swap them: AIN1 LOW, AIN2 HIGH. Guess first: what does the Speed row show? With a transistor you could only switch a motor on and off; four switches put the battery across it either way round. That’s an H-bridge.',
      passes: (state) =>
        driven(state).some(({ channel, motor }) => channel.mode === 'reverse' && Math.abs(motor.rpm) >= UP_TO_SPEED && pushesBack(motor)),
    },
    {
      id: 'coast',
      title: 'Let it coast',
      detail:
        'Now stop it: AIN1 and AIN2 both LOW. Every switch lets go, so nothing flows through the motor, and only its friction slows it. Watch the Speed row: how long does it take to stop?',
      passes: (state) =>
        driven(state).some(
          ({ channel, motor }) => channel.mode === 'coast' && Math.abs(motor.rpm) >= TURNING_RPM && Math.abs(motor.amps) < 1e-3,
        ),
    },
    {
      id: 'brake',
      title: 'Brake it',
      detail:
        'Run it again, then stop it with AIN1 and AIN2 both HIGH. Guess first: faster or slower than coasting? Both its ends are joined to ground now, and a spinning motor is a generator: its own back-EMF pushes current backwards through its winding (watch the current’s sign), and that current’s torque fights the spin.',
      passes: (state) =>
        driven(state).some(
          ({ channel, motor }) =>
            channel.mode === 'brake' && Math.abs(motor.rpm) >= TURNING_RPM && motor.amps * motor.rpm < 0 && Math.abs(motor.amps) > 0.01,
        ),
    },
    {
      id: 'half',
      title: 'Half speed, at last',
      detail:
        'AIN1 HIGH, AIN2 LOW, and your dimmer on PWMA: 5 ms on, 5 ms off. In Lesson 7, half on was nearly full speed, about 12 000 rpm. Guess first: what now? (PWMA LOW brakes, like both inputs HIGH.)',
      passes: (state) =>
        state.snapshot.readout !== undefined &&
        driven(state).some(({ motor }) => {
          const rpm = Math.abs(motor.averageRpm ?? 0);
          return !motor.held && motor.steady && rpm >= 0.35 * MOTOR.noLoadRpm && rpm <= 0.65 * MOTOR.noLoadRpm;
        }),
    },
  ],
  outro:
    'An H-bridge puts the battery across a motor either way round, and stops it two ways: let go, and it coasts on its friction; join its ends, and it brakes on its own back-EMF. Braking through every off-time is why PWM through a driver finally gives half speed at half on. Next, power: running the ESP32 from the battery through its regulator, and what happens when the battery can’t keep up. Build mode has the driver too.',
};

export const LESSONS: readonly Lesson[] = [LIGHT_AN_LED, SWITCHES_AND_BUTTONS, A_KNOB, CAPACITORS, TRANSISTORS, MICROCONTROLLER, MOTORS, DIRECTION];

export const lessonById = (id: string) => LESSONS.find((lesson) => lesson.id === id);

/** What's coming, from the roadmap: shown locked, so the path ahead is visible. */
export const COMING: readonly { readonly number: number; readonly title: string; readonly blurb: string }[] = [
  { number: 9, title: 'Power', blurb: 'The ESP32 from a battery, through its regulator, and what happens when the battery can’t keep up.' },
  { number: 10, title: 'The car', blurb: 'A 2D robot body, steered by your phone.' },
];
