import {
  arduino,
  Capacitor,
  Circuit,
  GROUND,
  NotWrittenYet,
  PN2222A,
  Potentiometer,
  ProgramRunner,
  Switch,
  TICK,
  Transistor,
  type Program,
} from '@bench/engine';
import { describe, expect, it } from 'vitest';
import { addWire, EMPTY_BOARD, removePart, removeWire, setProp, type Board } from '../builder/board';
import { gpioWritten, ledLoop, place } from '../builder/fixtures';
import { METER_START, type MeterState } from '../builder/meter';
import { BoardSim } from '../builder/sync';
import { A_KNOB, CAPACITORS, LIGHT_AN_LED, MICROCONTROLLER, SWITCHES_AND_BUTTONS, TRANSISTORS, type Lesson } from './lessons';
import { advance, backTo, currentStep } from './progress';

/** Plays a lesson against a board: checks the current step each frame, as the page does. */
function play(
  lesson: Lesson,
  sim: BoardSim,
  board: Board,
  seconds: number,
  done: ReadonlySet<string> = new Set(),
  meter: MeterState = METER_START,
) {
  sim.sync(board);
  let progress = done;
  for (let t = 0; t < seconds; t += 1 / 60) {
    sim.step(1 / 60);
    progress = advance(lesson, progress, { board, snapshot: sim.getSnapshot(), meter });
  }
  return progress;
}

const stepAt = (done: ReadonlySet<string>) => currentStep(LIGHT_AN_LED, done)?.id;

describe('Lesson 1: Light an LED', () => {
  it('starts by asking for a battery', () => {
    expect(stepAt(play(LIGHT_AN_LED, new BoardSim(), EMPTY_BOARD, 0.1))).toBe('battery');
  });

  it('takes a well-built 330 Ω loop all the way to burning one out', () => {
    const { board } = ledLoop(330);
    expect(stepAt(play(LIGHT_AN_LED, new BoardSim(), board, 0.5))).toBe('burn');
  });

  it('won’t pass a loop that lights the LED too dimly (1 kΩ: about 7 mA)', () => {
    expect(stepAt(play(LIGHT_AN_LED, new BoardSim(), ledLoop(1000).board, 0.5))).toBe('rated');
  });

  it('won’t pass a loop that runs it over its rating (68 Ω)', () => {
    expect(stepAt(play(LIGHT_AN_LED, new BoardSim(), ledLoop(68).board, 0.5))).toBe('rated');
  });

  it('won’t light an LED wired backwards', () => {
    let board = EMPTY_BOARD;
    const battery = place(board, 'battery');
    const resistor = place(battery.board, 'resistor', 0, 0, { ohms: 330 });
    const led = place(resistor.board, 'led');
    board = addWire(led.board, { part: battery.id, pin: 'plus' }, { part: resistor.id, pin: 'a' });
    board = addWire(board, { part: resistor.id, pin: 'b' }, { part: led.id, pin: 'cathode' });
    board = addWire(board, { part: led.id, pin: 'anode' }, { part: battery.id, pin: 'minus' });
    expect(stepAt(play(LIGHT_AN_LED, new BoardSim(), board, 0.5))).toBe('glow');
  });

  it('needs a ground wired in, not just placed', () => {
    const loop = ledLoop(330);
    const floating = removePart(loop.board, loop.ground);
    const unwired = place(floating, 'ground', 300, 300).board;
    expect(stepAt(play(LIGHT_AN_LED, new BoardSim(), unwired, 0.5))).toBe('ground');
  });

  it('finishes once a burnt LED is replaced and run safely again', () => {
    const loop = ledLoop(330);
    const sim = new BoardSim();
    let done = play(LIGHT_AN_LED, sim, loop.board, 0.5);
    const hot = setProp(loop.board, loop.resistor, 'ohms', 68);
    done = play(LIGHT_AN_LED, sim, hot, 6, done);
    expect(stepAt(done)).toBe('replace');
    // Still burnt: nothing lights, so it isn't done.
    done = play(LIGHT_AN_LED, sim, loop.board, 0.5, done);
    expect(stepAt(done)).toBe('replace');
    sim.replace(loop.led);
    done = play(LIGHT_AN_LED, sim, loop.board, 0.5, done);
    expect(stepAt(done)).toBeUndefined();
  });
});

/** Lesson 2 needs your switch (packages/engine/src/lesson-2-switches/switch.ts): until it's written, a switch isn't in the circuit. */
const switchWritten = (() => {
  try {
    new Switch('S1', new Circuit().node('a'), GROUND).stamp({
      time: 0,
      dt: TICK,
      ambient: 25,
      internal: () => GROUND,
      conductance: () => undefined,
      currentSource: () => undefined,
      voltageSource: () => 0 as never,
      junction: () => undefined,
      controlledCurrent: () => undefined,
    });
    return true;
  } catch (error) {
    if (error instanceof NotWrittenYet) return false;
    throw error;
  }
})();

/** Battery → slide switch (common in, side A out) → 330 Ω → LED → back to the battery. */
function switchLoop() {
  let board = EMPTY_BOARD;
  const battery = place(board, 'battery');
  const sw = place(battery.board, 'switch');
  const resistor = place(sw.board, 'resistor', 0, 0, { ohms: 330 });
  const led = place(resistor.board, 'led');
  board = addWire(led.board, { part: battery.id, pin: 'plus' }, { part: sw.id, pin: 'common' });
  board = addWire(board, { part: sw.id, pin: 'a' }, { part: resistor.id, pin: 'a' });
  board = addWire(board, { part: resistor.id, pin: 'b' }, { part: led.id, pin: 'anode' });
  board = addWire(board, { part: led.id, pin: 'cathode' }, { part: battery.id, pin: 'minus' });
  return { board, battery: battery.id, sw: sw.id, resistor: resistor.id, led: led.id };
}

/** Battery → two buttons → 330 Ω → LED → back: in series (one after the other) or in parallel (side by side). */
function buttonLoop(how: 'series' | 'parallel') {
  let board = EMPTY_BOARD;
  const battery = place(board, 'battery');
  const one = place(battery.board, 'button');
  const two = place(one.board, 'button');
  const resistor = place(two.board, 'resistor', 0, 0, { ohms: 330 });
  const led = place(resistor.board, 'led');
  board = addWire(led.board, { part: battery.id, pin: 'plus' }, { part: one.id, pin: 'a' });
  if (how === 'series') {
    board = addWire(board, { part: one.id, pin: 'b' }, { part: two.id, pin: 'a' });
  } else {
    board = addWire(board, { part: battery.id, pin: 'plus' }, { part: two.id, pin: 'a' });
    board = addWire(board, { part: one.id, pin: 'b' }, { part: two.id, pin: 'b' });
  }
  board = addWire(board, { part: two.id, pin: 'b' }, { part: resistor.id, pin: 'a' });
  board = addWire(board, { part: resistor.id, pin: 'b' }, { part: led.id, pin: 'anode' });
  board = addWire(board, { part: led.id, pin: 'cathode' }, { part: battery.id, pin: 'minus' });
  return { board, one: one.id, two: two.id };
}

const stepOf = (done: ReadonlySet<string>) => currentStep(SWITCHES_AND_BUTTONS, done)?.id;

describe.runIf(switchWritten)('Lesson 2: Switches and buttons', () => {
  it('lights through the switch, goes dark when it’s flipped, then wants the meter across the gap', () => {
    const loop = switchLoop();
    const sim = new BoardSim();
    let done = play(SWITCHES_AND_BUTTONS, sim, loop.board, 0.2);
    expect(stepOf(done)).toBe('off');
    const flipped = setProp(loop.board, loop.sw, 'side', 'b');
    done = play(SWITCHES_AND_BUTTONS, sim, flipped, 0.2, done);
    expect(stepOf(done)).toBe('gap');
    // Leads on common and side A (the open one now), either way round.
    const meter: MeterState = {
      mode: 'volts',
      leads: { red: { kind: 'pin', pin: { part: loop.sw, pin: 'a' } }, black: { kind: 'pin', pin: { part: loop.sw, pin: 'common' } } },
    };
    done = play(SWITCHES_AND_BUTTONS, sim, flipped, 0.2, done, meter);
    expect(stepOf(done)).toBe('button');
  });

  it('won’t count the gap with the leads on the closed side', () => {
    const loop = switchLoop();
    const sim = new BoardSim();
    const flipped = setProp(loop.board, loop.sw, 'side', 'b');
    const meter: MeterState = {
      mode: 'volts',
      leads: { red: { kind: 'pin', pin: { part: loop.sw, pin: 'common' } }, black: { kind: 'pin', pin: { part: loop.sw, pin: 'b' } } },
    };
    const done = play(SWITCHES_AND_BUTTONS, sim, flipped, 0.2, new Set(['loop', 'off']), meter);
    expect(stepOf(done)).toBe('gap');
  });

  it('lights through a button only while it’s held', () => {
    const { board, one, two } = buttonLoop('series');
    const sim = new BoardSim();
    const before = new Set(['loop', 'off', 'gap']);
    expect(stepOf(play(SWITCHES_AND_BUTTONS, sim, board, 0.2, before))).toBe('button');
    sim.press(one, true);
    expect(stepOf(play(SWITCHES_AND_BUTTONS, sim, board, 0.2, before))).toBe('button'); // two is still up
    sim.press(two, true);
    expect(stepOf(play(SWITCHES_AND_BUTTONS, sim, board, 0.2, before))).toBe('or'); // both down, in series: AND too
  });

  it('takes two buttons in series as AND, but not two in parallel both held', () => {
    const parallel = buttonLoop('parallel');
    const sim = new BoardSim();
    const upTo = new Set(['loop', 'off', 'gap', 'button']);
    sim.sync(parallel.board);
    sim.press(parallel.one, true);
    sim.press(parallel.two, true);
    expect(stepOf(play(SWITCHES_AND_BUTTONS, sim, parallel.board, 0.2, upTo))).toBe('and');
  });

  it('takes two buttons in parallel with just one held as OR', () => {
    const parallel = buttonLoop('parallel');
    const sim = new BoardSim();
    sim.sync(parallel.board);
    sim.press(parallel.two, true);
    const done = play(SWITCHES_AND_BUTTONS, sim, parallel.board, 0.2, new Set(['loop', 'off', 'gap', 'button', 'and']));
    expect(stepOf(done)).toBeUndefined();
  });
});

if (!switchWritten) {
  it.todo('Lesson 2: needs your switch, in packages/engine/src/lesson-2-switches/switch.ts');
}

/** Lesson 3 needs your knob (packages/engine/src/lesson-3-knob/potentiometer.ts): until it's written, a knob isn't in the circuit. */
const knobWritten = (() => {
  try {
    const c = new Circuit();
    new Potentiometer('RV1', c.node('a'), c.node('w'), GROUND).stamp({
      time: 0,
      dt: TICK,
      ambient: 25,
      internal: () => GROUND,
      conductance: () => undefined,
      currentSource: () => undefined,
      voltageSource: () => 0 as never,
      junction: () => undefined,
      controlledCurrent: () => undefined,
    });
    return true;
  } catch (error) {
    if (error instanceof NotWrittenYet) return false;
    throw error;
  }
})();

/** A 9 V battery with a knob across it, pin 1 on + (or on −, `flipped`), and the battery's − grounded. */
function knobAcross(flipped = false) {
  let board = EMPTY_BOARD;
  const battery = place(board, 'battery');
  const knob = place(battery.board, 'knob');
  const ground = place(knob.board, 'ground');
  board = addWire(ground.board, { part: battery.id, pin: 'plus' }, { part: knob.id, pin: flipped ? 'b' : 'a' });
  board = addWire(board, { part: battery.id, pin: 'minus' }, { part: knob.id, pin: flipped ? 'a' : 'b' });
  board = addWire(board, { part: battery.id, pin: 'minus' }, { part: ground.id, pin: 'pin' });
  return { board, battery: battery.id, knob: knob.id };
}

/** Battery + → resistor → pin 1 → wiper → LED → back to −: the knob as a dimmer. */
function knobDimmer(ohms: number | undefined, supply = '9v') {
  let board = EMPTY_BOARD;
  const battery = place(board, 'battery', 0, 0, { supply });
  const knob = place(battery.board, 'knob');
  const led = place(knob.board, 'led');
  board = led.board;
  if (ohms === undefined) {
    board = addWire(board, { part: battery.id, pin: 'plus' }, { part: knob.id, pin: 'a' });
  } else {
    const resistor = place(board, 'resistor', 0, 0, { ohms });
    board = addWire(resistor.board, { part: battery.id, pin: 'plus' }, { part: resistor.id, pin: 'a' });
    board = addWire(board, { part: resistor.id, pin: 'b' }, { part: knob.id, pin: 'a' });
  }
  board = addWire(board, { part: knob.id, pin: 'wiper' }, { part: led.id, pin: 'anode' });
  board = addWire(board, { part: led.id, pin: 'cathode' }, { part: battery.id, pin: 'minus' });
  return { board, knob: knob.id };
}

const knobStep = (done: ReadonlySet<string>) => currentStep(A_KNOB, done)?.id;
const onWiper = (knob: string, battery: string): MeterState => ({
  mode: 'volts',
  leads: { red: { kind: 'pin', pin: { part: knob, pin: 'wiper' } }, black: { kind: 'pin', pin: { part: battery, pin: 'minus' } } },
});
const UP_TO_DIMMER = new Set(['across', 'wiper', 'bottom', 'half']);

describe.runIf(knobWritten)('Lesson 3: A knob', () => {
  it('takes a knob across the battery, then wants the meter on its wiper', () => {
    const { board, battery, knob } = knobAcross();
    const sim = new BoardSim();
    expect(knobStep(play(A_KNOB, sim, board, 0.2))).toBe('wiper');
    // On the wiper and the + side: not what's asked.
    const wrong: MeterState = {
      mode: 'volts',
      leads: { ...onWiper(knob, battery).leads, black: { kind: 'pin', pin: { part: battery, pin: 'plus' } } },
    };
    expect(knobStep(play(A_KNOB, sim, board, 0.2, new Set(), wrong))).toBe('wiper');
    expect(knobStep(play(A_KNOB, sim, board, 0.2, new Set(), onWiper(knob, battery)))).toBe('bottom');
  });

  it('counts “all the way down” towards whichever end is on −, then half', () => {
    for (const flipped of [false, true]) {
      const { board, battery, knob } = knobAcross(flipped);
      const sim = new BoardSim();
      const meter = onWiper(knob, battery);
      let done = play(A_KNOB, sim, board, 0.2, new Set(), meter);
      expect(knobStep(done)).toBe('bottom'); // halfway isn't the bottom
      done = play(A_KNOB, sim, setProp(board, knob, 'turn', flipped ? 1 : 0), 0.2, done, meter); // towards + instead
      expect(knobStep(done)).toBe('bottom');
      done = play(A_KNOB, sim, setProp(board, knob, 'turn', flipped ? 0 : 1), 0.2, done, meter);
      expect(knobStep(done)).toBe('half');
      done = play(A_KNOB, sim, setProp(board, knob, 'turn', 0.5), 0.2, done, meter);
      expect(knobStep(done)).toBe('dimmer');
    }
  });

  it('finishes with an LED dimmed through the wiper, with a resistor in the loop', () => {
    const { board } = knobDimmer(330);
    expect(knobStep(play(A_KNOB, new BoardSim(), board, 0.2, UP_TO_DIMMER))).toBeUndefined();
  });

  it('won’t pass a dimmer with no resistor, even while the LED is lit', () => {
    const { board } = knobDimmer(undefined);
    expect(knobStep(play(A_KNOB, new BoardSim(), board, 0.2, UP_TO_DIMMER))).toBe('dimmer');
  });

  it('won’t pass while the knob is over its rating (9 V, 33 Ω, turned to the bright end)', () => {
    const { board, knob } = knobDimmer(33);
    const sim = new BoardSim();
    expect(knobStep(play(A_KNOB, sim, setProp(board, knob, 'turn', 0), 0.2, UP_TO_DIMMER))).toBe('dimmer');
    expect(sim.getSnapshot().parts[knob]?.over).toBe(true);
  });

  it('passes on the 3 V battery too, turned towards the bright end', () => {
    const { board, knob } = knobDimmer(33, 'aa');
    expect(knobStep(play(A_KNOB, new BoardSim(), setProp(board, knob, 'turn', 0.1), 0.2, UP_TO_DIMMER))).toBeUndefined();
  });
});

if (!knobWritten) {
  it.todo('Lesson 3: needs your knob, in packages/engine/src/lesson-3-knob/potentiometer.ts');
}

/** Lesson 4 needs your capacitor (packages/engine/src/lesson-4-capacitors/capacitor.ts): all three of its jobs. */
const capacitorWritten = (() => {
  const atRest = { time: 0, dt: TICK, ambient: 25, voltage: () => 0, across: () => 0, branchCurrent: () => 0 };
  try {
    const cap = new Capacitor('C1', new Circuit().node('a'), GROUND, 1e-3);
    cap.settle(atRest, TICK);
    cap.current(atRest);
    cap.stamp({
      time: 0,
      dt: TICK,
      ambient: 25,
      internal: () => GROUND,
      conductance: () => undefined,
      currentSource: () => undefined,
      voltageSource: () => 0 as never,
      junction: () => undefined,
      controlledCurrent: () => undefined,
    });
    return true;
  } catch (error) {
    if (error instanceof NotWrittenYet) return false;
    throw error;
  }
})();

/**
 * The battery charging a capacitor through 1 kΩ; then, across the capacitor, a resistor and an LED (when `ledOhms`
 * is given). `backwards` turns the capacitor round: minus towards the battery's +.
 */
function chargeLoop({
  uf = 1000,
  feedOhms = 1000,
  ledOhms,
  backwards = false,
}: {
  uf?: number;
  feedOhms?: number;
  ledOhms?: number;
  backwards?: boolean;
}) {
  let board = EMPTY_BOARD;
  const battery = place(board, 'battery');
  const feed = place(battery.board, 'resistor', 0, 0, { ohms: feedOhms });
  const cap = place(feed.board, 'capacitor', 0, 0, { uf });
  const [toFeed, toMinus] = backwards ? (['minus', 'plus'] as const) : (['plus', 'minus'] as const);
  board = addWire(cap.board, { part: battery.id, pin: 'plus' }, { part: feed.id, pin: 'a' });
  board = addWire(board, { part: feed.id, pin: 'b' }, { part: cap.id, pin: toFeed });
  board = addWire(board, { part: cap.id, pin: toMinus }, { part: battery.id, pin: 'minus' });
  if (ledOhms !== undefined) {
    const resistor = place(board, 'resistor', 0, 0, { ohms: ledOhms });
    const led = place(resistor.board, 'led');
    board = addWire(led.board, { part: cap.id, pin: 'plus' }, { part: resistor.id, pin: 'a' });
    board = addWire(board, { part: resistor.id, pin: 'b' }, { part: led.id, pin: 'anode' });
    board = addWire(board, { part: led.id, pin: 'cathode' }, { part: cap.id, pin: 'minus' });
  }
  return { board, battery: battery.id, cap: cap.id };
}

/**
 * The lesson's one-click version: a slide switch with common on the capacitor's +, side A to the battery's 1 kΩ
 * (filling it), side B to a resistor and an LED (lighting the LED from it). Starts on A.
 */
function switchedLoop(uf: number, ledOhms: number) {
  let board = EMPTY_BOARD;
  const battery = place(board, 'battery');
  const feed = place(battery.board, 'resistor', 0, 0, { ohms: 1000 });
  const slide = place(feed.board, 'switch', 0, 0, { side: 'a' });
  const cap = place(slide.board, 'capacitor', 0, 0, { uf });
  const resistor = place(cap.board, 'resistor', 0, 0, { ohms: ledOhms });
  const led = place(resistor.board, 'led');
  board = addWire(led.board, { part: battery.id, pin: 'plus' }, { part: feed.id, pin: 'a' });
  board = addWire(board, { part: feed.id, pin: 'b' }, { part: slide.id, pin: 'a' });
  board = addWire(board, { part: slide.id, pin: 'common' }, { part: cap.id, pin: 'plus' });
  board = addWire(board, { part: slide.id, pin: 'b' }, { part: resistor.id, pin: 'a' });
  board = addWire(board, { part: resistor.id, pin: 'b' }, { part: led.id, pin: 'anode' });
  board = addWire(board, { part: led.id, pin: 'cathode' }, { part: cap.id, pin: 'minus' });
  board = addWire(board, { part: cap.id, pin: 'minus' }, { part: battery.id, pin: 'minus' });
  return { board, slide: slide.id };
}

const unplug = (board: Board, battery: string) => {
  const wire = board.wires.find((w) => w.a.part === battery && w.a.pin === 'plus');
  if (!wire) throw new Error('no wire on the battery’s +');
  return removeWire(board, wire.id);
};

const capStep = (done: ReadonlySet<string>) => currentStep(CAPACITORS, done)?.id;
const across = (cap: string): MeterState => ({
  mode: 'volts',
  leads: { red: { kind: 'pin', pin: { part: cap, pin: 'plus' } }, black: { kind: 'pin', pin: { part: cap, pin: 'minus' } } },
});

describe.runIf(capacitorWritten)('Lesson 4: Capacitors', () => {
  it('passes the charge step once it’s half full, and only the right way round', () => {
    const { board } = chargeLoop({});
    expect(capStep(play(CAPACITORS, new BoardSim(), board, 0.4))).toBe('charge'); // R × C is 1 s: not yet
    expect(capStep(play(CAPACITORS, new BoardSim(), board, 1))).toBe('full');
    // Turned round, minus towards the battery's +: it fills the wrong way, warns, and the step waits.
    const backwards = chargeLoop({ backwards: true });
    const sim = new BoardSim();
    expect(capStep(play(CAPACITORS, sim, backwards.board, 2))).toBe('charge');
    expect(sim.getSnapshot().parts[backwards.cap]?.capacitor?.reversed).toBe(true);
  });

  it('wants the meter across it while it’s nearly full, then the battery unplugged', () => {
    const { board, battery, cap } = chargeLoop({});
    const sim = new BoardSim();
    let done = play(CAPACITORS, sim, board, 1);
    expect(capStep(done)).toBe('full');
    done = play(CAPACITORS, sim, board, 1, done, across(cap)); // 2 s: 86 %, not yet
    expect(capStep(done)).toBe('full');
    done = play(CAPACITORS, sim, board, 2, done, across(cap));
    expect(capStep(done)).toBe('hold');
    done = play(CAPACITORS, sim, board, 1, done, across(cap)); // still plugged in
    expect(capStep(done)).toBe('hold');
    done = play(CAPACITORS, sim, unplug(board, battery), 1, done, across(cap));
    expect(capStep(done)).toBe('glow');
  });

  it('lights an LED from the capacitor alone, but not while the battery’s still in', () => {
    const plugged = chargeLoop({ ledOhms: 330 });
    const sim = new BoardSim();
    const UP_TO_GLOW = new Set(['charge', 'full', 'hold']);
    let done = play(CAPACITORS, sim, plugged.board, 3, UP_TO_GLOW);
    expect(capStep(done)).toBe('glow'); // lit, but by the battery
    done = play(CAPACITORS, sim, unplug(plugged.board, plugged.battery), 1, done);
    expect(capStep(done)).toBe('longer');
  });

  it('wants 3 seconds of glow from one charge: 1000 µF through 330 Ω fades too soon; 2200 µF, or 1 kΩ, lasts', () => {
    const UP_TO_LONGER = new Set(['charge', 'full', 'hold', 'glow']);
    for (const [uf, ohms, finished] of [
      [1000, 330, false],
      [2200, 330, true],
      [1000, 1000, true],
    ] as const) {
      const loop = switchedLoop(uf, ohms);
      const sim = new BoardSim();
      let done = play(CAPACITORS, sim, loop.board, 12, UP_TO_LONGER); // slid to A: filling
      done = play(CAPACITORS, sim, setProp(loop.board, loop.slide, 'side', 'b'), 6, done); // slid to B: the LED
      expect(capStep(done) === undefined, `${String(uf)} µF, ${String(ohms)} Ω`).toBe(finished);
    }
  });

  it('counts it full once it stops climbing, when its leak keeps it short of 90 % (10 kΩ)', () => {
    // 10 kΩ against 2200 µF's 45.5 kΩ leak: it can only reach about 82 % of the battery.
    for (const uf of [1000, 2200]) {
      const { board, cap } = chargeLoop({ uf, feedOhms: 10000 });
      const done = play(CAPACITORS, new BoardSim(), board, 60, new Set(['charge']), across(cap));
      expect(capStep(done), `${String(uf)} µF`).toBe('hold');
    }
  });

  it('won’t count an LED that took more than its 30 mA at first, even once that’s died down (100 Ω)', () => {
    const loop = switchedLoop(1000, 100);
    const sim = new BoardSim();
    const UP_TO_GLOW = new Set(['charge', 'full', 'hold']);
    let done = play(CAPACITORS, sim, loop.board, 6, UP_TO_GLOW);
    done = play(CAPACITORS, sim, setProp(loop.board, loop.slide, 'side', 'b'), 3, done);
    expect(capStep(done)).toBe('glow');
  });

  it('counts the switch slid away from the battery as unplugged', () => {
    const loop = switchedLoop(1000, 330);
    const sim = new BoardSim();
    play(CAPACITORS, sim, loop.board, 3);
    expect(sim.getSnapshot().unpowered).toBe(0);
    play(CAPACITORS, sim, setProp(loop.board, loop.slide, 'side', 'b'), 1);
    expect(sim.getSnapshot().unpowered).toBeGreaterThan(0.9);
  });
});

/** Lesson 5 needs your transistor (packages/engine/src/lesson-5-transistors/transistor.ts): its diodes, its action and its current. */
const transistorWritten = (() => {
  const atRest = { time: 0, dt: TICK, ambient: 25, voltage: () => 0, across: () => 0, branchCurrent: () => 0 };
  const c = new Circuit();
  const q = new Transistor('Q1', c.node('c'), c.node('b'), GROUND);
  let junctions = 0;
  let controlled = 0;
  try {
    q.stamp({
      time: 0,
      dt: TICK,
      ambient: 25,
      internal: (name) => c.node(name),
      conductance: () => undefined,
      currentSource: () => undefined,
      voltageSource: () => 0 as never,
      junction: () => {
        junctions++;
      },
      controlledCurrent: () => {
        controlled++;
      },
    });
    q.current(atRest);
    return junctions > 0 && controlled > 0;
  } catch (error) {
    if (error instanceof NotWrittenYet) return false;
    throw error;
  }
})();

const qStep = (done: ReadonlySet<string>) => currentStep(TRANSISTORS, done)?.id;

/**
 * Lesson 5's circuit: battery + → 330 Ω → LED → collector, emitter → battery −. Its base fed by a push button and
 * 10 kΩ from the +, or by the knob across the battery and 47 kΩ from its wiper, or by nothing.
 */
function collectorLoop(feed: 'none' | 'button' | 'knob', turn = 0.5) {
  const battery = place(EMPTY_BOARD, 'battery');
  const load = place(battery.board, 'resistor', 0, 0, { ohms: 330 });
  const led = place(load.board, 'led');
  const q = place(led.board, 'transistor');
  let board = addWire(q.board, { part: battery.id, pin: 'plus' }, { part: load.id, pin: 'a' });
  board = addWire(board, { part: load.id, pin: 'b' }, { part: led.id, pin: 'anode' });
  board = addWire(board, { part: led.id, pin: 'cathode' }, { part: q.id, pin: 'collector' });
  board = addWire(board, { part: q.id, pin: 'emitter' }, { part: battery.id, pin: 'minus' });
  let button: string | undefined;
  let knob: string | undefined;
  if (feed === 'button') {
    const b = place(board, 'button');
    const r = place(b.board, 'resistor', 0, 0, { ohms: 10000 });
    board = addWire(r.board, { part: battery.id, pin: 'plus' }, { part: b.id, pin: 'a' });
    board = addWire(board, { part: b.id, pin: 'b' }, { part: r.id, pin: 'a' });
    board = addWire(board, { part: r.id, pin: 'b' }, { part: q.id, pin: 'base' });
    button = b.id;
  } else if (feed === 'knob') {
    const k = place(board, 'knob', 0, 0, { turn });
    const r = place(k.board, 'resistor', 0, 0, { ohms: 47000 });
    // Pin 1 on the −, pin 3 on the +: turning it up (towards pin 3) raises the wiper.
    board = addWire(r.board, { part: battery.id, pin: 'minus' }, { part: k.id, pin: 'a' });
    board = addWire(board, { part: k.id, pin: 'b' }, { part: battery.id, pin: 'plus' });
    board = addWire(board, { part: k.id, pin: 'wiper' }, { part: r.id, pin: 'a' });
    board = addWire(board, { part: r.id, pin: 'b' }, { part: q.id, pin: 'base' });
    knob = k.id;
  }
  const baseWire = board.wires.at(-1)?.id ?? '';
  return { board, q: q.id, led: led.id, button, knob, baseWire };
}

const clampOn = (wire: string): MeterState => ({ mode: 'amps', leads: { clamp: { kind: 'wire', wire, t: 0.5 } } });

describe.runIf(transistorWritten)('Lesson 5: Transistors', () => {
  it('starts with the LED dark on the collector, the base unconnected', () => {
    const loop = collectorLoop('none');
    const sim = new BoardSim();
    const done = play(TRANSISTORS, sim, loop.board, 0.2);
    expect(qStep(done)).toBe('switch');
    expect(sim.getSnapshot().parts[loop.q]?.transistor?.state).toBe('off');
  });

  it('switches the LED on through a button and 10 kΩ, with a small fraction of its current', () => {
    const loop = collectorLoop('button');
    const sim = new BoardSim();
    let done = play(TRANSISTORS, sim, loop.board, 0.2, new Set(['collector']));
    expect(qStep(done)).toBe('switch'); // not held yet: dark
    sim.press(loop.button ?? '', true);
    done = play(TRANSISTORS, sim, loop.board, 0.2, done);
    expect(qStep(done)).toBe('measure');
    const q = sim.getSnapshot().parts[loop.q]?.transistor;
    expect(q?.state).toBe('on');
    expect((q?.collectorAmps ?? 0) / (q?.baseAmps ?? 1)).toBeGreaterThan(20);
  });

  it('wants the clamp on the wire into the base, not the one into the collector', () => {
    const loop = collectorLoop('button');
    const sim = new BoardSim();
    sim.sync(loop.board);
    sim.press(loop.button ?? '', true);
    const UP_TO_MEASURE = new Set(['collector', 'switch']);
    const collectorWire = loop.board.wires.find((w) => w.b.part === loop.q && w.b.pin === 'collector')?.id ?? '';
    let done = play(TRANSISTORS, sim, loop.board, 0.2, UP_TO_MEASURE, clampOn(collectorWire));
    expect(qStep(done)).toBe('measure');
    done = play(TRANSISTORS, sim, loop.board, 0.2, done, clampOn(loop.baseWire));
    expect(qStep(done)).toBe('dimmer');
  });

  it('dims it with the knob and 47 kΩ: amplifying when turned low, fully on when turned up', () => {
    const UP_TO_DIMMER = new Set(['collector', 'switch', 'measure']);
    const low = collectorLoop('knob', 0.2);
    const sim = new BoardSim();
    let done = play(TRANSISTORS, sim, low.board, 0.2, UP_TO_DIMMER);
    expect(sim.getSnapshot().parts[low.q]?.transistor?.state).toBe('amplifying');
    expect(qStep(done)).toBe('full');
    done = play(TRANSISTORS, sim, setProp(low.board, low.knob ?? '', 'turn', 0.9), 0.2, done);
    expect(sim.getSnapshot().parts[low.q]?.transistor?.state).toBe('on');
    expect(qStep(done)).toBeUndefined();
  });

  it('follows the knob smoothly while amplifying: the LED’s current is the base’s times the gain', () => {
    const states: string[] = [];
    let last = 0;
    for (let turn = 0.05; turn <= 0.951; turn += 0.05) {
      const loop = collectorLoop('knob', turn);
      const sim = new BoardSim();
      sim.sync(loop.board);
      const q = sim.getSnapshot().parts[loop.q]?.transistor;
      const led = sim.getSnapshot().parts[loop.led]?.amps ?? 0;
      states.push(q?.state ?? '?');
      expect(led, `turn ${turn.toFixed(2)}`).toBeGreaterThanOrEqual(last - 1e-9); // never dims as it's turned up
      last = led;
      // Amplifying means the collector carries at least 90 % of gain × base (ON_SHARE in sync.ts), up to all of it.
      if (q?.state === 'amplifying') {
        expect((q.collectorAmps ?? 0) / q.baseAmps, `turn ${turn.toFixed(2)}`).toBeGreaterThanOrEqual(0.9 * PN2222A.forwardGain);
        expect((q.collectorAmps ?? 0) / q.baseAmps, `turn ${turn.toFixed(2)}`).toBeLessThanOrEqual(PN2222A.forwardGain * 1.001);
      }
    }
    expect(states[0]).toBe('off');
    expect(states.filter((state) => state === 'amplifying').length).toBeGreaterThanOrEqual(3);
    expect(states.at(-1)).toBe('on');
  });

  it('isn’t fooled by an LED lit straight from the battery, beside a transistor that’s off', () => {
    let board = collectorLoop('none').board;
    const r = place(board, 'resistor', 0, 0, { ohms: 330 });
    const led = place(r.board, 'led');
    const battery = board.parts.find((p) => p.kind === 'battery')?.id ?? '';
    board = addWire(led.board, { part: battery, pin: 'plus' }, { part: r.id, pin: 'a' });
    board = addWire(board, { part: r.id, pin: 'b' }, { part: led.id, pin: 'anode' });
    board = addWire(board, { part: led.id, pin: 'cathode' }, { part: battery, pin: 'minus' });
    const done = play(TRANSISTORS, new BoardSim(), board, 0.5, new Set(['collector']));
    expect(qStep(done)).toBe('switch');
  });
});

if (!transistorWritten) {
  it.todo('Lesson 5: needs your transistor, in packages/engine/src/lesson-5-transistors/transistor.ts');
}

const sixStep = (done: ReadonlySet<string>) => currentStep(MICROCONTROLLER, done)?.id;

/** Plays a lesson against a board with a program on it: the program runs right here, a tick at a time. */
async function playProgram(
  sim: BoardSim,
  board: Board,
  seconds: number,
  done: ReadonlySet<string> = new Set(),
  meter: MeterState = METER_START,
) {
  sim.sync(board);
  let progress = done;
  for (let t = 0; t < seconds; t += 1 / 60) {
    await sim.advance(1 / 60);
    progress = advance(MICROCONTROLLER, progress, { board, snapshot: sim.getSnapshot(), meter });
  }
  return progress;
}

/** A BoardSim that runs `program` on its ESP32, on this thread. */
const simRunning = (program: Program) => new BoardSim(() => new ProgramRunner(program));

/** An ESP32 on its own, and a way to wire to its pins. */
function withChip() {
  const chip = place(EMPTY_BOARD, 'esp32');
  const pin = (id: string) => ({ part: chip.id, pin: id });
  return { board: chip.board, chip: chip.id, pin };
}

const BLINK2: Program = {
  setup() {
    arduino.pinMode(2, arduino.OUTPUT);
  },
  async loop() {
    arduino.digitalWrite(2, arduino.HIGH);
    await arduino.delay(500);
    arduino.digitalWrite(2, arduino.LOW);
    await arduino.delay(500);
  },
};

/** Reads GPIO4 every 200 ms, set up as `mode`. */
const readButton = (mode: arduino.PinMode): Program => ({
  setup() {
    arduino.pinMode(4, mode);
  },
  async loop() {
    arduino.Serial.println(arduino.digitalRead(4));
    await arduino.delay(200);
  },
});

describe.runIf(gpioWritten)('Lesson 6: A microcontroller', () => {
  it('starts with the meter across 3V3 and GND', async () => {
    const { board, chip, pin } = withChip();
    const meter: MeterState = { mode: 'volts', leads: { red: { kind: 'pin', pin: pin('v3') }, black: { kind: 'pin', pin: pin('gnd') } } };
    const done = await playProgram(simRunning(BLINK2), board, 0.1, new Set(), meter);
    expect(sixStep(done)).toBe('blink');
    expect(chip).toBeDefined();
  });

  it('blinks an LED on GPIO2 from the program', async () => {
    const { board: start, pin } = withChip();
    const r = place(start, 'resistor', 0, 0, { ohms: 330 });
    const led = place(r.board, 'led');
    let board = addWire(led.board, pin('gpio2'), { part: r.id, pin: 'a' });
    board = addWire(board, { part: r.id, pin: 'b' }, { part: led.id, pin: 'anode' });
    board = addWire(board, { part: led.id, pin: 'cathode' }, pin('gnd'));
    const sim = simRunning(BLINK2);
    let done = await playProgram(sim, board, 1.2, new Set(['power']));
    expect(sixStep(done)).toBe('blink'); // twice on, so far
    done = await playProgram(sim, board, 1.5, done);
    expect(sixStep(done)).toBe('float');
  });

  it('sees a button’s pin float with INPUT, and hold firm with INPUT_PULLDOWN, pressed twice', async () => {
    const { board: start, pin } = withChip();
    const button = place(start, 'button');
    const board = addWire(addWire(button.board, pin('v3'), { part: button.id, pin: 'a' }), { part: button.id, pin: 'b' }, pin('gpio4'));
    const UP_TO_FLOAT = new Set(['power', 'blink']);
    const floating = await playProgram(simRunning(readButton(arduino.INPUT)), board, 0.5, UP_TO_FLOAT);
    expect(sixStep(floating)).toBe('pull');

    const sim = simRunning(readButton(arduino.INPUT_PULLDOWN));
    let done = await playProgram(sim, board, 0.3, floating);
    for (let presses = 0; presses < 2; presses++) {
      sim.press(button.id, true);
      done = await playProgram(sim, board, 0.3, done);
      sim.press(button.id, false);
      done = await playProgram(sim, board, 0.3, done);
    }
    expect(sixStep(done)).toBe('knob');
  });

  it('reads the knob on GPIO34 across most of 0 to 4095 as it’s turned', async () => {
    const { board: start, pin } = withChip();
    const knob = place(start, 'knob', 0, 0, { turn: 0 });
    let board = addWire(knob.board, pin('v3'), { part: knob.id, pin: 'a' });
    board = addWire(board, { part: knob.id, pin: 'b' }, pin('gnd'));
    board = addWire(board, { part: knob.id, pin: 'wiper' }, pin('gpio34'));
    const sim = simRunning({
      async loop() {
        arduino.Serial.println(arduino.analogRead(34));
        await arduino.delay(200);
      },
    });
    let done: ReadonlySet<string> = new Set(['power', 'blink', 'float', 'pull']);
    for (const turn of [0, 0.5, 1]) done = await playProgram(sim, setProp(board, knob.id, 'turn', turn), 0.3, done);
    expect(sixStep(done)).toBe('drive');
    expect(sim.getSnapshot().program?.serial).toMatch(/\d+\n/);
  });

  it('switches an LED on 9 V through the transistor from GPIO5, only once the grounds are shared', async () => {
    const { board: start, pin } = withChip();
    const battery = place(start, 'battery');
    const load = place(battery.board, 'resistor', 0, 0, { ohms: 330 });
    const led = place(load.board, 'led');
    const q = place(led.board, 'transistor');
    const feed = place(q.board, 'resistor', 0, 0, { ohms: 10000 });
    let board = addWire(feed.board, { part: battery.id, pin: 'plus' }, { part: load.id, pin: 'a' });
    board = addWire(board, { part: load.id, pin: 'b' }, { part: led.id, pin: 'anode' });
    board = addWire(board, { part: led.id, pin: 'cathode' }, { part: q.id, pin: 'collector' });
    board = addWire(board, { part: q.id, pin: 'emitter' }, pin('gnd'));
    board = addWire(board, pin('gpio5'), { part: feed.id, pin: 'a' });
    board = addWire(board, { part: feed.id, pin: 'b' }, { part: q.id, pin: 'base' });
    const ON: Program = {
      setup() {
        arduino.pinMode(5, arduino.OUTPUT);
        arduino.digitalWrite(5, arduino.HIGH);
      },
      async loop() {
        await arduino.delay(1000);
      },
    };
    const UP_TO_DRIVE = new Set(['power', 'blink', 'float', 'pull', 'knob']);
    const apart = await playProgram(simRunning(ON), board, 0.3, UP_TO_DRIVE);
    expect(sixStep(apart)).toBe('drive'); // the battery's − isn't joined to GND: no loop for the LED's current
    const joined = addWire(board, { part: battery.id, pin: 'minus' }, pin('gnd2'));
    const done = await playProgram(simRunning(ON), joined, 0.3, UP_TO_DRIVE);
    expect(sixStep(done)).toBeUndefined();
  });
});

if (!gpioWritten) {
  it.todo('Lesson 6: needs your GPIO pin, in packages/engine/src/lesson-6-microcontroller/gpio.ts');
}

describe('Going back to a step', () => {
  const all = new Set(CAPACITORS.steps.map((step) => step.id));

  it('un-ticks that step and every one after it, and keeps the ones before', () => {
    expect([...backTo(CAPACITORS, all, 'hold')]).toEqual(['charge', 'full']);
    expect(capStep(backTo(CAPACITORS, all, 'hold'))).toBe('hold');
    expect(backTo(CAPACITORS, all, 'charge').size).toBe(0);
    expect(backTo(CAPACITORS, new Set(['charge']), 'longer')).toEqual(new Set(['charge']));
  });

  it('leaves the progress alone for a step the lesson doesn’t have', () => {
    expect(backTo(CAPACITORS, all, 'nope')).toBe(all);
  });

  it.runIf(capacitorWritten)('checks the circuit again from there: a step it still passes ticks straight back', () => {
    const { board } = chargeLoop({});
    const sim = new BoardSim();
    let done = play(CAPACITORS, sim, board, 1); // charged past half: on to "full"
    expect(capStep(done)).toBe('full');
    done = backTo(CAPACITORS, done, 'charge');
    expect(capStep(done)).toBe('charge');
    done = play(CAPACITORS, sim, board, 0.1, done); // still charged, so "charge" passes again at once
    expect(capStep(done)).toBe('full');
  });
});

if (!capacitorWritten) {
  it.todo('Lesson 4: needs your capacitor, in packages/engine/src/lesson-4-capacitors/capacitor.ts');
}
