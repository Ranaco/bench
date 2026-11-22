import { Battery, Circuit, GROUND, JUMPER, Led, RED_LED, Resistor, THERMAL_VOLTAGE, Wire, type Node } from '@bench/engine';
import { describe, expect, it } from 'vitest';
import { SUPPLIES } from '../kit';
import {
  connect,
  splitWire,
  type Board,
  type Tap,
  copyParts,
  moveParts,
  pasteClip,
  removeItems,
  rotateParts,
  addWire,
  EMPTY_BOARD,
  movePart,
  removePart,
  removeWire,
  rotatePart,
  setProp,
} from './board';
import { CATALOG, GRID, pinAt } from './catalog';
import { boxBetween, inBox, partBox, routeBetween, simplify, tapPoint, wireRoute } from './route';
import { parseBoard } from './save';
import { ledLoop, partOf, place, run } from './fixtures';
import { BoardSim } from './sync';

const NINE_VOLT = SUPPLIES[2];

describe('the board', () => {
  it('labels parts by kind, reusing the lowest free number', () => {
    let board = place(EMPTY_BOARD, 'resistor').board;
    board = place(board, 'resistor').board;
    expect(board.parts.map((p) => p.label)).toEqual(['R1', 'R2']);
    board = removePart(board, board.parts[0].id);
    board = place(board, 'resistor').board;
    expect(board.parts.map((p) => p.label)).toEqual(['R2', 'R1']);
  });

  it('never hands out an id twice, so undo can’t mix two parts up', () => {
    const first = place(EMPTY_BOARD, 'led');
    const gone = removePart(first.board, first.id);
    expect(place(gone, 'led').id).not.toBe(first.id);
  });

  it('takes a part’s wires with it when it’s removed', () => {
    const { board, led } = ledLoop(330);
    const after = removePart(board, led);
    expect(after.wires).toHaveLength(2);
    expect(after.wires.every((w) => w.a.part !== led && w.b.part !== led)).toBe(true);
  });

  it('ignores a wire from a pin to itself, or one that doubles another', () => {
    const { board, battery, resistor } = ledLoop(330);
    expect(addWire(board, { part: battery, pin: 'plus' }, { part: battery, pin: 'plus' })).toBe(board);
    expect(addWire(board, { part: resistor, pin: 'a' }, { part: battery, pin: 'plus' })).toBe(board);
  });

  it('turns a part a quarter at a time, moving its pins with it', () => {
    let board = place(EMPTY_BOARD, 'resistor', 100, 100).board;
    const id = board.parts[0].id;
    expect(pinAt(board.parts[0], 'b')).toEqual({ x: 160, y: 100 });
    board = rotatePart(board, id);
    expect(pinAt(board.parts[0], 'b')).toEqual({ x: 100, y: 160 });
    for (let i = 0; i < 3; i++) board = rotatePart(board, id);
    expect(board.parts[0].rotation).toBe(0);
  });

  it('saves and loads as JSON, and refuses anything else', () => {
    const { board } = ledLoop(330);
    expect(parseBoard(JSON.stringify(board))).toEqual(board);
    expect(parseBoard('not json')).toBeUndefined();
    expect(parseBoard('{"version":2}')).toBeUndefined();
    expect(parseBoard(null)).toBeUndefined();
  });

  it('loads what it can from a damaged or newer save', () => {
    const { board, led } = ledLoop(330);
    const saved = JSON.parse(JSON.stringify(board)) as { parts: Record<string, unknown>[]; wires: unknown[]; nextId: number };
    saved.parts.push({ id: 'p99', kind: 'flux-capacitor', label: 'F1', x: 0, y: 0, rotation: 0, props: {} });
    saved.wires.push({ id: 'w98', label: 'W9', a: { part: led, pin: 'anode' }, b: { part: 'p99', pin: 'a' } });
    saved.wires.push({ id: 'w97', label: 'W8', a: { part: led, pin: 'gate' }, b: { part: led, pin: 'anode' } });
    saved.nextId = 2;
    const loaded = parseBoard(JSON.stringify(saved));
    expect(loaded?.parts).toEqual(board.parts);
    expect(loaded?.wires).toEqual(board.wires);
    // The counter moves past every id in use, so new parts can't collide with old ones.
    expect(loaded?.nextId).toBe(board.nextId);
  });
});

describe('the live circuit', () => {
  it('reads what the same loop reads with perfect connections, less the jumper wires’ few milliohms', () => {
    const { board, led } = ledLoop(330);
    const sim = new BoardSim();
    sim.sync(board);
    // The same loop with perfect connections, straight from the engine.
    const reference = new Circuit();
    const plus = reference.node('plus');
    const mid = reference.node('mid');
    reference.add(new Battery('B1', plus, GROUND, NINE_VOLT.volts, NINE_VOLT.ohms));
    reference.add(new Resistor('R1', plus, mid, 330));
    const ideal = reference.add(new Led('D1', mid, GROUND));
    reference.step(0);
    const expected = reference.currentThrough(ideal) ?? Number.NaN;
    const reading = partOf(sim, led);
    const amps = reading.amps ?? Number.NaN;

    // Three jumper wires sit in the loop (the fourth, to ground, carries nothing). Their extra resistance
    // costs current in proportion to the whole loop's: the resistor, the battery inside, and the LED's
    // own slope at this current (n·Vt / I through the junction, plus its series resistance).
    const wireOhms = 3 * new Wire('W', 1 as Node, 2 as Node).ohmsAt(25);
    const ledOhms = (RED_LED.ideality * THERMAL_VOLTAGE) / expected + RED_LED.seriesOhms;
    const predicted = (expected * wireOhms) / (330 + NINE_VOLT.ohms + ledOhms);
    expect((expected - amps) / predicted).toBeCloseTo(1, 1);
    expect(reading.volts).toBeCloseTo(2.04, 2);
    expect(sim.getSnapshot().grounded).toBe(true);
  });

  it('gives every wire its own current', () => {
    const { board } = ledLoop(330);
    const sim = new BoardSim();
    sim.sync(board);
    const { wires } = sim.getSnapshot();
    const [toResistor, toLed, back, toGround] = board.wires.map((w) => wires[w.id]?.amps ?? Number.NaN);
    expect(toResistor).toBeCloseTo(0.022, 3);
    expect(toLed).toBeCloseTo(toResistor, 9);
    expect(back).toBeCloseTo(toResistor, 9);
    expect(Math.abs(toGround)).toBeLessThan(1e-9); // nothing returns through ground
  });

  it('burns the LED out at 68 Ω in a few seconds', () => {
    const { board, led } = ledLoop(68);
    const sim = new BoardSim();
    sim.sync(board);
    expect(partOf(sim, led).over).toBe(true);
    run(sim, 1);
    expect(partOf(sim, led).burnt).toBe(false);
    run(sim, 5);
    expect(partOf(sim, led).burnt).toBe(true);
    expect(partOf(sim, led).amps).toBe(0);
  });

  it('keeps a burnt LED burnt when you add a part and wire it up', () => {
    const loop = ledLoop(68);
    const sim = new BoardSim();
    sim.sync(loop.board);
    run(sim, 6);
    const extra = place(loop.board, 'resistor', 300, 300);
    sim.sync(addWire(extra.board, { part: extra.id, pin: 'a' }, { part: extra.id, pin: 'b' }));
    sim.sync(movePart(extra.board, loop.led, 40, 40));
    run(sim, 0.5);
    expect(partOf(sim, loop.led).burnt).toBe(true);
  });

  it('swaps in a fresh, cool part for Replace, and for a new value', () => {
    const loop = ledLoop(68);
    const sim = new BoardSim();
    sim.sync(loop.board);
    run(sim, 6);
    sim.replace(loop.led);
    expect(partOf(sim, loop.led).burnt).toBe(false);
    expect(partOf(sim, loop.led).celsius).toBeCloseTo(25, 6);

    sim.sync(setProp(loop.board, loop.resistor, 'ohms', 330));
    run(sim, 2);
    const led = partOf(sim, loop.led);
    expect(led.burnt).toBe(false);
    expect(led.amps).toBeCloseTo(0.022, 3);
  });

  it('follows undo: back to an earlier board, the circuit is that board again', () => {
    const loop = ledLoop(330);
    const sim = new BoardSim();
    sim.sync(loop.board);
    const cut = removeWire(loop.board, loop.board.wires[1].id);
    sim.sync(cut);
    expect(partOf(sim, loop.led).amps).toBeCloseTo(0, 9);
    sim.sync(loop.board);
    expect(partOf(sim, loop.led).amps).toBeCloseTo(0.022, 3);
  });

  it('keeps every current right without a ground, it just floats', () => {
    const loop = ledLoop(330);
    const floating = removePart(loop.board, loop.ground);
    const sim = new BoardSim();
    sim.sync(floating);
    const snapshot = sim.getSnapshot();
    expect(snapshot.grounded).toBe(false);
    expect(partOf(sim, loop.led).amps).toBeCloseTo(0.022, 3);
  });

  it('reuses the nodes of removed parts instead of piling them up', () => {
    const loop = ledLoop(330);
    const sim = new BoardSim();
    for (let i = 0; i < 20; i++) {
      sim.sync(loop.board);
      sim.sync(removePart(loop.board, loop.led));
    }
    sim.sync(loop.board);
    // 7 pins, plus the battery's cell and the LED's junction inside them: the next node is number 10.
    expect(sim.circuit.node('probe')).toBe(10);
    expect(partOf(sim, loop.led).amps).toBeCloseTo(0.022, 3);
  });
});

describe('wire routes', () => {
  const left = { x: -1, y: 0 };
  const down = { x: 0, y: 1 };

  it('goes round a part rather than back through it', () => {
    // From a pin facing left, to a pin below-left that faces down (an LED's cathode to a battery's minus).
    const route = routeBetween({ x: 300, y: 0 }, left, { x: 0, y: 60 }, down);
    // Out to the left, down past the battery's pin, across, and up into it from below.
    expect(route).toEqual([
      { x: 300, y: 0 },
      { x: 280, y: 0 },
      { x: 280, y: 80 },
      { x: 0, y: 80 },
      { x: 0, y: 60 },
    ]);
  });

  it('loops a wire between a part’s own pins round the outside, never under it', () => {
    for (const kind of ['battery', 'resistor', 'led'] as const) {
      for (const turns of [0, 1, 2, 3]) {
        let board = place(EMPTY_BOARD, kind, 100, 100).board;
        const part = board.parts[0];
        for (let i = 0; i < turns; i++) board = rotatePart(board, part.id);
        const [a, b] = CATALOG[kind].pins.map((pin) => ({ part: part.id, pin: pin.id }));
        board = addWire(board, a, b);
        const turned = board.parts[0];
        const route = wireRoute(new Map([[turned.id, turned]]), board.wires[0]) ?? [];
        const box = partBox(turned);
        // Every corner of the route lies on or outside the part's box: no segment runs through it.
        const inside = route.slice(1, -1).filter((p) => p.x > box.x && p.x < box.x + box.width && p.y > box.y && p.y < box.y + box.height);
        expect(inside, `${kind} turned ${String(turns * 90)}°`).toEqual([]);
        expect(route.length, `${kind} turned ${String(turns * 90)}°`).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('is a straight line between two pins that face each other', () => {
    expect(routeBetween({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 200, y: 0 }, left)).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ]);
  });
});

describe('groups', () => {
  it('moves a group in one change, wires and all', () => {
    const loop = ledLoop(330);
    const moved = moveParts(loop.board, [loop.battery, loop.resistor], 40, -20);
    expect(moved.parts.find((p) => p.id === loop.battery)).toMatchObject({ x: 40, y: -20 });
    expect(moved.parts.find((p) => p.id === loop.led)).toMatchObject({ x: 0, y: 0 });
    expect(moved.wires).toBe(loop.board.wires);
    expect(moveParts(loop.board, [loop.led], 0, 0)).toBe(loop.board);
  });

  it('turns each part in a group about its own centre', () => {
    const loop = ledLoop(330);
    const turned = rotateParts(loop.board, [loop.led, loop.resistor]);
    expect(turned.parts.filter((p) => p.rotation === 90).map((p) => p.id).sort()).toEqual([loop.led, loop.resistor].sort());
  });

  it('removes parts with their wires, and loose wires, together', () => {
    const loop = ledLoop(330);
    const groundWire = loop.board.wires[3].id;
    const left = removeItems(loop.board, [loop.led], [groundWire]);
    expect(left.parts.map((p) => p.id)).not.toContain(loop.led);
    expect(left.wires.map((w) => w.id)).toEqual([loop.board.wires[0].id]);
  });

  it('copies the wires between copied parts, and no others', () => {
    const loop = ledLoop(330);
    const clip = copyParts(loop.board, [loop.battery, loop.resistor]);
    expect(clip.parts).toHaveLength(2);
    expect(clip.wires.map((w) => w.id)).toEqual([loop.board.wires[0].id]);
  });

  it('pastes as new parts with new ids and labels, wired to each other', () => {
    const loop = ledLoop(330);
    const clip = copyParts(loop.board, [loop.battery, loop.resistor, loop.led, loop.ground]);
    const pasted = pasteClip(loop.board, clip, 200, 0);
    expect(pasted.parts).toHaveLength(4);
    expect(pasted.wires).toHaveLength(4);
    const fresh = pasted.board.parts.filter((p) => pasted.parts.includes(p.id));
    expect(fresh.map((p) => p.label).sort()).toEqual(['B2', 'D2', 'GND2', 'R2']);
    const ids = [...pasted.board.parts.map((p) => p.id), ...pasted.board.wires.map((w) => w.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const wire of pasted.board.wires.filter((w) => pasted.wires.includes(w.id))) {
      expect(pasted.parts).toContain(wire.a.part);
      expect(pasted.parts).toContain(wire.b.part);
    }
  });

  it('runs a pasted copy as its own circuit', () => {
    const loop = ledLoop(330);
    const all = [loop.battery, loop.resistor, loop.led, loop.ground];
    const pasted = pasteClip(loop.board, copyParts(loop.board, all), 0, 300);
    const sim = new BoardSim();
    sim.sync(pasted.board);
    const copiedLed = pasted.parts[all.indexOf(loop.led)];
    expect(partOf(sim, copiedLed).amps).toBeCloseTo(0.022, 3);
    expect(partOf(sim, loop.led).amps).toBeCloseTo(0.022, 3);
  });

  it('box-selects the parts it touches and the wires it crosses', () => {
    let board = place(EMPTY_BOARD, 'resistor', 0, 0).board;
    board = place(board, 'resistor', 400, 0).board;
    const [near, far] = board.parts;
    const wire = { id: 'w', points: [{ x: 60, y: 0 }, { x: 340, y: 0 }] };
    const caught = inBox(board.parts, [wire], boxBetween({ x: 100, y: -50 }, { x: -100, y: 50 }));
    expect(caught.parts).toEqual([near.id]);
    expect(caught.wires).toEqual(['w']);
    expect(inBox(board.parts, [wire], boxBetween({ x: 150, y: 20 }, { x: 250, y: 60 })).wires).toEqual([]);
    expect(inBox(board.parts, [], { x: 330, y: -10, width: 20, height: 20 }).parts).toEqual([far.id]);
  });
});

describe('taps', () => {
  const partsOf = (board: Board) => new Map(board.parts.map((p) => [p.id, p]));
  const routeOf = (board: Board, id: string) => {
    const wire = board.wires.find((w) => w.id === id);
    if (!wire) throw new Error(`no wire ${id}`);
    return wireRoute(partsOf(board), wire) ?? [];
  };
  /** Every grid point strictly inside a straight run of a route: everywhere a tap can go. */
  const insidePoints = (points: readonly { x: number; y: number }[]) => {
    const found: { x: number; y: number }[] = [];
    for (let i = 1; i < points.length; i++) {
      const [from, to] = [points[i - 1], points[i]];
      const steps = Math.round(Math.hypot(to.x - from.x, to.y - from.y) / GRID);
      for (let k = 1; k < steps; k++) found.push({ x: from.x + ((to.x - from.x) * k) / steps, y: from.y + ((to.y - from.y) * k) / steps });
    }
    return found;
  };
  /** The LED loop laid out the way you'd build it, so every wire is long enough to tap and most of them bend. */
  const spreadLoop = (ohms: number) => {
    const loop = ledLoop(ohms);
    let board = movePart(loop.board, loop.battery, -240, 60);
    board = movePart(board, loop.resistor, 0, -140);
    board = movePart(board, loop.led, 260, 80);
    board = movePart(board, loop.ground, -240, 260);
    return { ...loop, board };
  };
  const tapAt = (board: Board, id: string, near: { x: number; y: number }): Tap => {
    const spot = tapPoint(routeOf(board, id), near);
    if (!spot) throw new Error('no tap there');
    return { wire: id, ...spot };
  };

  it('cuts a wire into two halves that add up to it, joined at a junction', () => {
    const loop = spreadLoop(330);
    const id = loop.board.wires[1].id;
    const route = routeOf(loop.board, id);
    const tap = tapAt(loop.board, id, insidePoints(route)[1]);
    const done = splitWire(loop.board, tap);
    if (!done) throw new Error('no split');
    const [first, second] = done.split.halves.map((h) => done.board.wires.find((w) => w.id === h));
    expect((first?.metres ?? 0) + (second?.metres ?? 0)).toBeCloseTo(JUMPER.lengthMetres, 15);
    expect(done.board.wires.some((w) => w.id === id)).toBe(false);
    expect(done.board.parts.find((p) => p.id === done.split.junction.part)?.kind).toBe('junction');
  });

  it('changes nothing in the circuit when nothing is attached to the tap, even saved, loaded or copied', () => {
    const loop = spreadLoop(330);
    const reference = new BoardSim();
    reference.sync(loop.board);
    const expected = partOf(reference, loop.led).amps ?? Number.NaN;

    const id = loop.board.wires[0].id;
    const split = splitWire(loop.board, tapAt(loop.board, id, insidePoints(routeOf(loop.board, id))[2]));
    if (!split) throw new Error('no split');
    const reloaded = parseBoard(JSON.stringify(split.board));
    if (!reloaded) throw new Error('did not load');
    for (const board of [split.board, reloaded]) {
      const sim = new BoardSim();
      sim.sync(board);
      expect(partOf(sim, loop.led).amps).toBeCloseTo(expected, 9);
    }
    const everything = split.board.parts.map((p) => p.id);
    const copy = pasteClip(split.board, copyParts(split.board, everything), 0, 400);
    const sim = new BoardSim();
    sim.sync(copy.board);
    const copiedLed = copy.parts[everything.indexOf(loop.led)];
    expect(partOf(sim, copiedLed).amps).toBeCloseTo(expected, 9);
  });

  it('puts a second LED in parallel through two taps', () => {
    const loop = spreadLoop(330);
    const led2 = place(loop.board, 'led', 400, 0);
    let board = led2.board;
    // Anode to the wire from the resistor to D1, cathode to the wire back to the battery.
    const toAnode = board.wires[1].id;
    const back = board.wires[2].id;
    board = connect(board, { pin: { part: led2.id, pin: 'anode' } }, { tap: tapAt(board, toAnode, insidePoints(routeOf(board, toAnode))[1]) }).board;
    const backNow = board.wires.find((w) => w.id === back)?.id ?? '';
    board = connect(board, { pin: { part: led2.id, pin: 'cathode' } }, { tap: tapAt(board, backNow, insidePoints(routeOf(board, backNow))[3]) }).board;
    expect(board.parts.filter((p) => p.kind === 'junction')).toHaveLength(2);
    const sim = new BoardSim();
    sim.sync(board);
    expect(partOf(sim, loop.led).amps).toBeCloseTo(0.0112, 3);
    expect(partOf(sim, led2.id).amps).toBeCloseTo(0.0112, 3);
  });

  it('heals back into one whole wire when the tap wire is deleted', () => {
    const loop = spreadLoop(330);
    const extra = place(loop.board, 'resistor', 300, 300);
    const id = loop.board.wires[1].id;
    const tapped = connect(extra.board, { pin: { part: extra.id, pin: 'a' } }, { tap: tapAt(extra.board, id, insidePoints(routeOf(extra.board, id))[1]) });
    const tapWire = tapped.board.wires.at(-1)?.id ?? '';
    const healed = removeWire(tapped.board, tapWire);
    expect(healed.parts.some((p) => p.kind === 'junction')).toBe(false);
    expect(healed.wires).toHaveLength(loop.board.wires.length);
    const whole = healed.wires.find((w) => w.label === 'W2');
    expect(whole?.metres).toBeCloseTo(JUMPER.lengthMetres, 15);
    expect(whole?.a).toEqual(loop.board.wires[1].a);
    expect(whole?.b).toEqual(loop.board.wires[1].b);
  });

  it('deletes a junction by taking away what was tapped in: the wire it cut heals, the circuit runs as before', () => {
    const loop = spreadLoop(330);
    const extra = place(loop.board, 'resistor', 300, 300);
    const id = loop.board.wires[1].id;
    const tapped = connect(extra.board, { pin: { part: extra.id, pin: 'a' } }, { tap: tapAt(extra.board, id, insidePoints(routeOf(extra.board, id))[1]) });
    const junction = tapped.board.parts.find((p) => p.kind === 'junction')?.id ?? '';
    const after = removeItems(tapped.board, [junction], []);
    expect(after.parts.some((p) => p.kind === 'junction')).toBe(false);
    expect(after.wires).toHaveLength(loop.board.wires.length);
    const sim = new BoardSim();
    sim.sync(after);
    expect(partOf(sim, loop.led).amps).toBeCloseTo(0.022, 3);
  });

  it('never puts a junction on a wire end or a bend: a drop there slides onto the straight run', () => {
    const { board } = spreadLoop(330);
    for (const wire of board.wires) {
      const route = routeOf(board, wire.id);
      for (const corner of route) {
        const spot = tapPoint(route, corner);
        if (spot) expect(route.some((p) => p.x === spot.at.x && p.y === spot.at.y)).toBe(false);
      }
    }
  });

  it('joins two different wires with a junction on each', () => {
    const loop = spreadLoop(330);
    const [first, second] = [loop.board.wires[0].id, loop.board.wires[2].id];
    const result = connect(
      loop.board,
      { tap: tapAt(loop.board, first, insidePoints(routeOf(loop.board, first))[1]) },
      { tap: tapAt(loop.board, second, insidePoints(routeOf(loop.board, second))[2]) },
    );
    expect(result.splits).toHaveLength(2);
    expect(result.board.parts.filter((p) => p.kind === 'junction')).toHaveLength(2);
    // That jumper shorts the resistor and the LED together: the battery now drives just the wires.
    const sim = new BoardSim();
    sim.sync(result.board);
    expect(partOf(sim, loop.led).amps).toBeLessThan(1e-6);
  });

  it('leaves the board exactly as it was for a wire that would only double one already there', () => {
    const loop = spreadLoop(330);
    const id = loop.board.wires[0].id;
    const inside = insidePoints(routeOf(loop.board, id));
    // From partway along W1 to the resistor pin W1 already ends on.
    const toItsOwnEnd = connect(loop.board, { tap: tapAt(loop.board, id, inside[1]) }, { pin: loop.board.wires[0].b });
    expect(toItsOwnEnd.board).toBe(loop.board);
    expect(toItsOwnEnd.splits).toEqual([]);
  });

  it('leaves the board as it was when both ends land on the same wire', () => {
    const loop = spreadLoop(330);
    const id = loop.board.wires[2].id;
    const inside = insidePoints(routeOf(loop.board, id));
    const result = connect(loop.board, { tap: tapAt(loop.board, id, inside[1]) }, { tap: tapAt(loop.board, id, inside[inside.length - 2]) });
    expect(result.board).toBe(loop.board);
    expect(result.board.parts.filter((p) => p.kind === 'junction')).toHaveLength(0);
    const shape = (b: Board) =>
      [...b.wires].sort((x, y) => x.label.localeCompare(y.label)).map((w) => ({ a: w.a, b: w.b, metres: Math.round(w.metres * 1e12) }));
    expect(shape(result.board)).toEqual(shape(loop.board));
  });

  it('never runs a tapped-in wire along on top of the wire it joins', () => {
    const loop = spreadLoop(330);
    // A resistor below and to the left of the top wire, its left pin facing away: the awkward case.
    for (const [x, y] of [[100, 220], [-100, 220], [100, -300], [400, 0]]) {
      const extra = place(loop.board, 'resistor', x, y);
      const id = loop.board.wires[1].id;
      for (const point of insidePoints(routeOf(extra.board, id))) {
        const tapped = connect(extra.board, { pin: { part: extra.id, pin: 'a' } }, { tap: tapAt(extra.board, id, point) });
        const junction = tapped.board.parts.find((p) => p.kind === 'junction');
        const tapWire = tapped.board.wires.find((w) => w.a.part === extra.id || w.b.part === extra.id);
        if (!junction || !tapWire) throw new Error('no tap');
        const route = routeOf(tapped.board, tapWire.id);
        const fromJunction = route[0].x === junction.x && route[0].y === junction.y ? route[1] : route[route.length - 2];
        // The step off the junction goes across the cut wire, never along it.
        const across = junction.props.axis === 'h' ? fromJunction.x === junction.x : fromJunction.y === junction.y;
        expect(across, `resistor at ${String(x)},${String(y)}, tap at ${String(point.x)},${String(point.y)}`).toBe(true);
      }
    }
  });

  it('draws the two halves along exactly the path the wire took, wherever it is cut', () => {
    const { board } = spreadLoop(330);
    for (const wire of board.wires.slice(0, 3)) {
      const route = routeOf(board, wire.id);
      for (const point of insidePoints(route)) {
        const done = splitWire(board, tapAt(board, wire.id, point));
        if (!done) throw new Error('no split');
        const [first, second] = done.split.halves.map((h) => routeOf(done.board, h));
        expect(simplify([...first, ...second.slice(1)]), `${wire.label} cut at ${String(point.x)},${String(point.y)}`).toEqual(route);
      }
    }
  });
});
