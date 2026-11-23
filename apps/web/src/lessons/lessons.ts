import { PN2222A, RED_LED } from '@bench/engine';
import { netsOf, type Board, type PartKind, type PinRef, type PlacedPart } from '../builder/board';
import { CATALOG, supplyFor } from '../builder/catalog';
import type { MeterState } from '../builder/meter';
import type { BoardSnapshot, PartReading } from '../builder/sync';
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
const litByCollector = (state: LessonState, collectorAmps: number) =>
  collectorAmps >= GLOW_AMPS && liveLeds(state).some((led) => Math.abs((led.amps ?? 0) - collectorAmps) <= 0.02 * collectorAmps);

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
          (q) => q.state === 'on' && litByCollector(state, q.collectorAmps) && q.collectorAmps >= SWITCH_GAIN * q.baseAmps,
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

export const LESSONS: readonly Lesson[] = [LIGHT_AN_LED, SWITCHES_AND_BUTTONS, A_KNOB, CAPACITORS, TRANSISTORS];

export const lessonById = (id: string) => LESSONS.find((lesson) => lesson.id === id);

/** What's coming, from the roadmap: shown locked, so the path ahead is visible. */
export const COMING: readonly { readonly number: number; readonly title: string; readonly blurb: string }[] = [
  { number: 6, title: 'A microcontroller', blurb: 'An ESP32 runs your code and reads your buttons and your knob: floating inputs, pull-ups, and a voltage as a number.' },
  { number: 7, title: 'Motors', blurb: 'H-bridges, flyback diodes and brownouts, where your capacitors and transistors come back.' },
  { number: 8, title: 'The car', blurb: 'A 2D robot body, steered by your phone.' },
];
