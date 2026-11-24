import { SingularMatrix, solveAllInPlace, solveInPlace } from './linear';
import { FLICKER_FUSION_HZ, SeenAverage } from './seen';
import {
  AMBIENT_CELSIUS,
  GROUND,
  NotWrittenYet,
  PartFailed,
  type Branch,
  type Curve,
  type Method,
  type Node,
  type Part,
  type Readings,
  type Stamp,
  type Unwritten,
} from './types';

/** The engine's heartbeat, in seconds. Time always advances in whole ticks. */
export const TICK = 0.001;

/**
 * The first of the small steps a tick is cut into after something changes all at once, with a fast part on the board
 * (see Part.fast), s. Each step after it is twice as long, until the tick is done.
 */
export const FIRST_STEP = 1e-8;

/** A whisper of conductance from every node to ground, so no node floats. */
const GMIN = 1e-12;
/** Newton guesses allowed per solve before giving up. */
const MAX_ITERATIONS = 200;
/** A junction has settled when its voltage moves less than this between guesses… */
const VOLT_TOLERANCE = 1e-9;
/** …and its current agrees with the straight-line estimate to within this. */
const AMP_TOLERANCE = 1e-12;
const RELATIVE_TOLERANCE = 1e-6;
/** Forward junction voltages may jump straight to this… */
const JUNCTION_KNEE = 0.5;
/** …and after that climb at most this much per guess, so exponentials can't overflow. */
const JUNCTION_STEP = 0.1;

export interface StepResult {
  /** True when every solve found a consistent answer. */
  readonly converged: boolean;
  /** Most guesses any one solve needed. */
  readonly iterations: number;
  /** Parts whose junctions were still moving when the solver gave up. */
  readonly unsettled: readonly string[];
}

/** How well the last solve obeys the laws it's built on. Both should be ~0. */
export interface Audit {
  /** Worst mismatch between current in and current out at any node, A. */
  readonly worstNodeAmps: number;
  /** Power delivered minus power absorbed across the whole circuit, W. */
  readonly powerImbalance: number;
  /** Total power delivered by sources, W, for scale. */
  readonly powerDelivered: number;
}

interface Conductance {
  readonly a: Node;
  readonly b: Node;
  readonly siemens: number;
  readonly owner: Part;
}

interface CurrentSource {
  readonly from: Node;
  readonly to: Node;
  readonly amps: number;
  readonly owner: Part;
}

interface VoltageSource {
  readonly plus: Node;
  readonly minus: Node;
  readonly volts: number;
  readonly owner: Part;
}

/**
 * A current set by a curve of the voltage between two nodes, a and b: a junction's own voltage, or the one
 * steering a controlled current. Newton's method guesses that voltage, and straightens the curve around it.
 */
interface Guessed {
  readonly a: Node;
  readonly b: Node;
  readonly curve: Curve;
  /** The guessed voltage this solve linearised around. */
  readonly volts: number;
  readonly amps: number;
  readonly slope: number;
  readonly owner: Part;
}

/** A junction: the current flows between the same two nodes whose voltage sets it. */
type Junction = Guessed;

/** A controlled current: it flows from `from` to `to`, set by the voltage from a to b. */
interface Controlled extends Guessed {
  readonly from: Node;
  readonly to: Node;
}

/**
 * Guesses are kept per part and per pair of nodes, so a junction and a current it controls (a transistor's
 * base-emitter junction, and the collector current it sets) always share one guess.
 */
const guessKey = (a: Node, b: Node) => `${String(a)}>${String(b)}`;

/** A solved linear system, with the stamps that produced it. */
/**
 * What a multimeter would show: averages over the ticks since the last readout, as a meter averages between the
 * numbers it shows. A part or node that's been there only part of that time is averaged over its own ticks.
 */
export interface Readout {
  /** Each part's average current, A, for parts whose current() is written. */
  readonly amps: ReadonlyMap<Part, number>;
  /** Each of those parts' average power, W: volts × amps tick by tick, then averaged (not average volts × average amps). */
  readonly watts: ReadonlyMap<Part, number>;
  /** A node's average voltage, V; undefined for one with no ticks in that time. */
  volts(node: Node): number | undefined;
}

interface Solved {
  readonly assembly: Assembly;
  readonly solution: Float64Array;
  readonly nodeCount: number;
}

/**
 * A circuit: nodes, the parts between them, and the solver that works out
 * every voltage and current. Call `step` with the seconds that have passed.
 */
export class Circuit {
  readonly ground = GROUND;
  /** Seconds simulated so far. Always a whole number of ticks. */
  time = 0;
  /** Temperature of the air around the circuit, °C. */
  ambient = AMBIENT_CELSIUS;
  /** How the last step went. */
  lastStep: StepResult = { converged: true, iterations: 0, unsettled: [] };

  private readonly nodeNames: string[] = ['ground'];
  private readonly parts: Part[] = [];
  private readonly missing = new Map<Part, Map<Method, NotWrittenYet>>();
  private readonly junctionVolts = new Map<Part, Map<string, number>>();
  private readonly internals = new Map<Part, Map<string, Node>>();
  /**
   * Each part's current as the last solve left it, read before the parts
   * react to the tick (a capacitor moves on to its new charge, an LED to its
   * new temperature), so it describes the same moment as the voltages do.
   */
  private readonly measured = new Map<Part, number | undefined>();
  /** Each part's current × time, and the time, over the ticks since averageCurrents() last ran. */
  private readonly sums = new Map<Part, { charge: number; seconds: number }>();
  /** Each part's current as an eye would see the light it makes (see seen.ts), from tick to tick. */
  private readonly seen = new Map<Part, SeenAverage>();
  /** Each part's charge, energy and time since the last readout (see takeReadout). */
  private readonly meterParts = new Map<Part, { charge: number; energy: number; seconds: number }>();
  /** Each node's volts × time, and its time, since the last readout, by node number. */
  private meterVolts: number[] = [];
  private meterSeconds: number[] = [];
  private last: Solved | undefined;
  private ticks = 0;
  private pending = 0;
  /** True when something changed all at once since the last tick (see changed()). */
  private sudden = false;
  /** How far into the current tick the step being solved starts, s, and how long it is. */
  private within = 0;
  private stepDt = TICK;
  /** The first small step after a sudden change (see FIRST_STEP); a test can shrink it to check it's small enough. */
  firstStep = FIRST_STEP;
  /** Nodes given back by `release`, reused before new ones are made. */
  private readonly spare: Node[] = [];

  /**
   * Adds a node and returns it. A node keeps its number for as long as it's in
   * use; numbers given back with `release` are reused.
   */
  node(name: string): Node {
    const reused = this.spare.pop();
    if (reused !== undefined) {
      this.nodeNames[reused] = name;
      return reused;
    }
    this.nodeNames.push(name);
    return (this.nodeNames.length - 1) as Node;
  }

  /** Gives a node back once no part uses it, so the next `node()` can reuse it. */
  release(node: Node): void {
    if (node === GROUND || this.spare.includes(node)) return;
    // Whatever reuses it starts its readout afresh.
    this.meterVolts[node] = 0;
    this.meterSeconds[node] = 0;
    this.nodeNames[node] = 'spare';
    this.spare.push(node);
  }

  /**
   * Says something just changed all at once, outside the solver: a switch flipped, a pin written, a knob turned.
   * Adding, removing or replacing a part says so itself.
   */
  changed(): void {
    this.sudden = true;
  }

  /** Adds a part and returns it. */
  add<P extends Part>(part: P): P {
    this.parts.push(part);
    this.measured.delete(part);
    this.sudden = true;
    return part;
  }

  /**
   * Takes a part out of the circuit. Every other part keeps its state: a hot
   * resistor stays hot, a burnt LED stays burnt. The part's private nodes are
   * released; release the nodes it was wired to yourself, once nothing else uses them.
   */
  remove(part: Part): void {
    const index = this.parts.indexOf(part);
    if (index === -1) return;
    this.parts.splice(index, 1);
    this.sudden = true;
    this.missing.delete(part);
    this.measured.delete(part);
    this.sums.delete(part);
    this.seen.delete(part);
    this.meterParts.delete(part);
    this.junctionVolts.delete(part);
    const internal = this.internals.get(part);
    if (internal) {
      for (const node of internal.values()) this.release(node);
      this.internals.delete(part);
    }
  }

  /** Swaps one part for another in the same place, like replacing a burnt LED. */
  replace(old: Part, next: Part): void {
    const index = this.parts.indexOf(old);
    if (index === -1) throw new Error(`${old.name} isn't in this circuit`);
    this.parts[index] = next;
    this.sudden = true;
    this.missing.delete(old);
    this.measured.delete(old);
    this.sums.delete(old);
    this.seen.delete(old);
    this.meterParts.delete(old);
    this.junctionVolts.delete(old);
    const internal = this.internals.get(old);
    if (internal) {
      this.internals.delete(old);
      this.internals.set(next, internal);
    }
  }

  /**
   * Advances `dt` seconds in whole ticks, solving the circuit and letting the
   * parts react after each one. Leftover time carries into the next call, so
   * results don't depend on how time is chopped up. `step(0)` just solves.
   */
  step(dt: number): StepResult {
    this.pending += Math.max(dt, 0);
    const due = Math.floor(this.pending / TICK + 1e-9);
    if (due === 0) {
      this.lastStep = this.solve();
      this.measure();
      return this.lastStep;
    }

    let converged = true;
    let iterations = 0;
    const unsettled = new Set<string>();
    for (let i = 0; i < due; i++) {
      // A tick is one step, unless something just changed all at once with a fast part on the board: then small
      // steps, each twice the last, so the fast part's quick reaction is followed rather than jumped over.
      const fine = this.sudden && this.parts.some((part) => part.fast === true);
      this.sudden = false;
      let step = fine ? this.firstStep : TICK;
      for (this.within = 0; ; this.within += this.stepDt, step *= 2) {
        // The last step lands exactly on the tick: one that would leave less than itself to go takes the rest.
        const last = TICK - this.within - step < step;
        this.stepDt = last ? TICK - this.within : step;
        const result = this.solve();
        iterations = Math.max(iterations, result.iterations);
        if (last) {
          this.measure();
          this.addToAverages();
        }
        if (result.converged) this.settleParts();
        else {
          converged = false;
          for (const name of result.unsettled) unsettled.add(name);
        }
        if (last) break;
      }
      this.within = 0;
      this.stepDt = TICK;
      this.ticks++;
      this.time = this.ticks * TICK;
    }
    this.pending = Math.max(0, this.pending - due * TICK);
    this.lastStep = { converged, iterations, unsettled: [...unsettled] };
    return this.lastStep;
  }

  /** Volts at `node`, measured from ground. */
  voltage(node: Node): number {
    if (node === GROUND || !this.last) return 0;
    return valueAt(this.last.solution, node - 1);
  }

  /** Volts at `a` minus volts at `b`. */
  across(a: Node, b: Node): number {
    return this.voltage(a) - this.voltage(b);
  }

  /**
   * Amps through `part` in the last solve, or undefined when its current()
   * isn't written yet. A part added since is asked now.
   */
  currentThrough(part: Part): number | undefined {
    if (this.lacks(part, 'current') || this.lacks(part, 'stamp')) return undefined;
    if (this.measured.has(part)) return this.measured.get(part);
    return this.call(part, 'current', () => part.current(this.readings()));
  }

  /**
   * Ohms between two nodes as the last solve left the circuit: how far a current pushed in at `a` and out at `b` would
   * move the voltage between them, per amp. Batteries count as their internal resistance, diodes at the slope they
   * settled on. Infinity before the first solve, or when nothing connects them but the solver's own leak to ground.
   */
  resistanceBetween(a: Node, b: Node): number {
    return this.resistancesBetween([[a, b]])[0] ?? Infinity;
  }

  /** resistanceBetween() for several pairs at once, for the cost of little more than one. */
  resistancesBetween(pairs: readonly (readonly [Node, Node])[]): number[] {
    const last = this.last;
    if (!last) return pairs.map(() => Infinity);
    try {
      return last.assembly.resistances(last.nodeCount, pairs);
    } catch (error) {
      if (error instanceof SingularMatrix) return pairs.map(() => Infinity);
      throw error;
    }
  }

  /** Watts `part` is turning into heat (or light), or negative when it's supplying power. */
  powerOf(part: Part): number {
    if (!this.last) return 0;
    let watts = 0;
    for (const flow of this.flows(this.last)) if (flow.owner === part) watts += flow.watts;
    return watts;
  }

  /** Checks the last solve against Kirchhoff's current law and conservation of energy. */
  audit(): Audit {
    const last = this.last;
    if (!last) return { worstNodeAmps: 0, powerImbalance: 0, powerDelivered: 0 };

    const leaving = new Float64Array(last.nodeCount + 1);
    let balance = 0;
    let delivered = 0;
    for (const flow of this.flows(last)) {
      leaving[flow.a] += flow.amps;
      leaving[flow.b] -= flow.amps;
      balance += flow.watts;
      if (flow.watts < 0) delivered -= flow.watts;
    }
    let worst = 0;
    for (let node = 1; node <= last.nodeCount; node++) worst = Math.max(worst, Math.abs(leaving[node]));
    return { worstNodeAmps: worst, powerImbalance: Math.abs(balance), powerDelivered: delivered };
  }

  /**
   * Part methods that aren't written yet. A part without stamp() is left out
   * of the circuit; one without settle() conducts but never heats up.
   */
  get notWritten(): readonly Unwritten[] {
    const list: Unwritten[] = [];
    for (const methods of this.missing.values()) {
      for (const [method, error] of methods) list.push({ part: error.part, method, file: error.file });
    }
    return list;
  }

  private readings(): Readings {
    const last = this.last;
    return {
      time: this.time + this.within,
      dt: this.stepDt,
      ambient: this.ambient,
      voltage: (node) => this.voltage(node),
      across: (a, b) => this.across(a, b),
      branchCurrent: (branch) => (last ? -valueAt(last.solution, last.nodeCount + branch) : 0),
    };
  }

  /** Reads every part's current from the solve just made, before anything reacts to it. */
  private measure(): void {
    this.measured.clear();
    const readings = this.readings();
    for (const part of this.parts) {
      if (this.lacks(part, 'stamp') || this.lacks(part, 'current')) continue;
      const amps = this.call(part, 'current', () => part.current(readings));
      if (!this.lacks(part, 'current')) this.measured.set(part, amps);
    }
  }

  /**
   * Each part's average current over the ticks since this was last called, A, and starts again; a part with no
   * ticks since isn't in it. How much charge moved over that time: what a wire's flow dots move by. (How bright a
   * light looks is seenCurrent(): an eye's time, not a screen frame's.)
   */
  averageCurrents(): Map<Part, number> {
    const averages = new Map<Part, number>();
    for (const [part, { charge, seconds }] of this.sums) averages.set(part, charge / seconds);
    this.sums.clear();
    return averages;
  }

  /**
   * A part's current as an eye would see the light it makes, A: a light flickering faster than an eye can follow
   * looks as bright as its average (see seen.ts). Undefined before its first tick.
   */
  seenCurrent(part: Part): number | undefined {
    return this.seen.get(part)?.amps;
  }

  /** Every part's and node's averages since the last readout (see Readout), and starts again. */
  takeReadout(): Readout {
    const amps = new Map<Part, number>();
    const watts = new Map<Part, number>();
    for (const [part, { charge, energy, seconds }] of this.meterParts) {
      amps.set(part, charge / seconds);
      watts.set(part, energy / seconds);
    }
    const volts = this.meterVolts;
    const seconds = this.meterSeconds;
    this.meterParts.clear();
    this.meterVolts = [];
    this.meterSeconds = [];
    return {
      amps,
      watts,
      volts: (node) => {
        if (node === GROUND) return 0;
        const time = seconds[node] ?? 0;
        return time > 0 ? (volts[node] ?? 0) / time : undefined;
      },
    };
  }

  /** Adds the tick just solved to each part's running averages. */
  private addToAverages(): void {
    this.addToReadout();
    for (const [part, amps] of this.measured) {
      if (amps === undefined) continue;
      const seen = this.seen.get(part);
      if (seen) seen.add(amps);
      else this.seen.set(part, new SeenAverage(amps, Math.round(1 / (FLICKER_FUSION_HZ * TICK))));
      const sum = this.sums.get(part);
      if (sum) {
        sum.charge += amps * TICK;
        sum.seconds += TICK;
      } else this.sums.set(part, { charge: amps * TICK, seconds: TICK });
    }
  }

  /** Adds the tick just solved to the readout: each part's current and power, each node's voltage. */
  private addToReadout(): void {
    const last = this.last;
    if (!last) return;
    for (const [part, amps] of this.measured) {
      if (amps === undefined) continue;
      const entry = this.meterParts.get(part);
      if (entry) {
        entry.charge += amps * TICK;
        entry.seconds += TICK;
      } else this.meterParts.set(part, { charge: amps * TICK, energy: 0, seconds: TICK });
    }
    // One pass over every current for every part's power: powerOf() for each would go over them all for each.
    for (const flow of this.flows(last)) {
      const entry = flow.owner && this.meterParts.get(flow.owner);
      if (entry) entry.energy += flow.watts * TICK;
    }
    for (let node = 1; node <= last.nodeCount; node++) {
      this.meterVolts[node] = (this.meterVolts[node] ?? 0) + voltageIn(last.solution, node as Node) * TICK;
      this.meterSeconds[node] = (this.meterSeconds[node] ?? 0) + TICK;
    }
  }

  private settleParts(): void {
    const readings = this.readings();
    for (const part of this.parts) {
      if (this.lacks(part, 'stamp') || this.lacks(part, 'settle')) continue;
      this.call(part, 'settle', () => part.settle?.(readings, this.stepDt));
    }
  }

  private lacks(part: Part, method: Method): boolean {
    return this.missing.get(part)?.has(method) ?? false;
  }

  /**
   * Runs one of a part's methods. A method that isn't written yet is noted and
   * skipped from then on; any other failure is raised again, naming the part.
   */
  private call<T>(part: Part, method: Method, run: () => T): T | undefined {
    try {
      return run();
    } catch (error) {
      if (error instanceof NotWrittenYet) {
        let methods = this.missing.get(part);
        if (!methods) {
          methods = new Map();
          this.missing.set(part, methods);
        }
        methods.set(method, error);
        if (method === 'stamp') this.junctionVolts.delete(part);
        return undefined;
      }
      if (error instanceof PartFailed) throw error;
      throw new PartFailed(part.name, method, error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Newton's method: linearise every junction at a guessed voltage, solve the
   * resulting linear circuit, move the guesses toward the answer, and repeat
   * until both voltages and currents stop changing.
   */
  private solve(): StepResult {
    const unsettled = new Set<string>();
    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      const assembly = this.assemble();
      const nodeCount = this.nodeNames.length - 1;
      const solution = assembly.solve(nodeCount);
      this.last = { assembly, solution, nodeCount };

      unsettled.clear();
      for (const guessed of [...assembly.junctions, ...assembly.controlled]) {
        const reached = voltageIn(solution, guessed.a) - voltageIn(solution, guessed.b);
        const next = limitJunction(reached, guessed.volts, guessed.curve.knee);
        if (next !== reached || !junctionSettled(guessed, reached)) unsettled.add(guessed.owner.name);
        this.guessesFor(guessed.owner).set(guessKey(guessed.a, guessed.b), next);
      }
      if (unsettled.size === 0) return { converged: true, iterations: iteration, unsettled: [] };
    }
    return { converged: false, iterations: MAX_ITERATIONS, unsettled: [...unsettled] };
  }

  private assemble(): Assembly {
    const assembly = new Assembly(
      this.time + this.within,
      this.stepDt,
      this.ambient,
      () => this.nodeNames.length - 1,
      (owner, name) => this.internalNode(owner, name),
      (owner, a, b) => this.guessesFor(owner).get(guessKey(a, b)) ?? 0,
    );
    for (const part of this.parts) {
      if (this.lacks(part, 'stamp')) continue;
      const mark = assembly.mark(part);
      try {
        this.call(part, 'stamp', () => {
          part.stamp(assembly);
        });
      } finally {
        if (this.lacks(part, 'stamp')) assembly.rollback(mark);
      }
    }
    return assembly;
  }

  private internalNode(owner: Part, name: string): Node {
    let nodes = this.internals.get(owner);
    if (!nodes) {
      nodes = new Map();
      this.internals.set(owner, nodes);
    }
    let node = nodes.get(name);
    if (node === undefined) {
      node = this.node(`${owner.name}.${name}`);
      nodes.set(name, node);
    }
    return node;
  }

  private guessesFor(part: Part): Map<string, number> {
    let guesses = this.junctionVolts.get(part);
    if (!guesses) {
      guesses = new Map();
      this.junctionVolts.set(part, guesses);
    }
    return guesses;
  }

  /**
   * Every current in the last solve, as (from node a, to node b, amps, watts
   * absorbed). Junctions use their true curve, not the straight-line estimate,
   * so this measures the physics rather than the arithmetic.
   */
  private *flows(last: Solved): Generator<{ a: Node; b: Node; amps: number; watts: number; owner?: Part }> {
    const { assembly, solution, nodeCount } = last;
    const v = (node: Node) => voltageIn(solution, node);
    for (let node = 1; node <= nodeCount; node++) {
      const volts = v(node as Node);
      yield { a: node as Node, b: GROUND, amps: GMIN * volts, watts: GMIN * volts * volts };
    }
    for (const c of assembly.conductances) {
      const volts = v(c.a) - v(c.b);
      yield { a: c.a, b: c.b, amps: c.siemens * volts, watts: c.siemens * volts * volts, owner: c.owner };
    }
    for (const s of assembly.sources) {
      yield { a: s.from, b: s.to, amps: s.amps, watts: s.amps * (v(s.from) - v(s.to)), owner: s.owner };
    }
    for (const [k, s] of assembly.voltageSources.entries()) {
      const amps = valueAt(solution, nodeCount + k);
      yield { a: s.plus, b: s.minus, amps, watts: amps * (v(s.plus) - v(s.minus)), owner: s.owner };
    }
    for (const j of assembly.junctions) {
      const volts = v(j.a) - v(j.b);
      const amps = j.curve.current(volts);
      yield { a: j.a, b: j.b, amps, watts: amps * volts, owner: j.owner };
    }
    for (const c of assembly.controlled) {
      const amps = c.curve.current(v(c.a) - v(c.b));
      yield { a: c.from, b: c.to, amps, watts: amps * (v(c.from) - v(c.to)), owner: c.owner };
    }
  }
}

/** `values[index]`, or 0 before anything has been stored there. */
function valueAt(values: ArrayLike<number>, index: number): number {
  return index < values.length ? values[index] : 0;
}

function voltageIn(solution: Float64Array, node: Node): number {
  return node === GROUND ? 0 : valueAt(solution, node - 1);
}

/** Stops a forward-biased junction leaping so far that its exponential overflows. */
function limitJunction(reached: number, previous: number, knee = 0): number {
  if (reached <= knee + JUNCTION_KNEE || reached <= previous + JUNCTION_STEP) return reached;
  return Math.max(previous + JUNCTION_STEP, knee + JUNCTION_KNEE);
}

/** True when the guess barely moved and the curve agrees with its straight-line estimate. */
function junctionSettled(j: Guessed, reached: number): boolean {
  const actual = j.curve.current(reached);
  const step = Math.abs(reached - j.volts);
  // Still, in volts; or moving so little that its current changes by less than the solver resolves. A diode
  // carrying picoamps (hanging off a circuit by nothing but leakage) can wobble by a fraction of a millivolt
  // from guess to guess without its current, or anything else, changing in any digit that counts.
  const steepest = Math.max(j.slope, j.curve.slope(reached));
  const still =
    step <= VOLT_TOLERANCE + RELATIVE_TOLERANCE * Math.abs(reached) ||
    step * steepest <= AMP_TOLERANCE + RELATIVE_TOLERANCE * Math.abs(actual);
  if (!still) return false;
  const estimate = j.amps + j.slope * (reached - j.volts);
  return Math.abs(actual - estimate) <= AMP_TOLERANCE + RELATIVE_TOLERANCE * Math.max(Math.abs(actual), Math.abs(estimate));
}

interface Mark {
  readonly conductances: number;
  readonly sources: number;
  readonly voltageSources: number;
  readonly junctions: number;
  readonly controlled: number;
}

/** Collects every part's stamps for one guess, then builds and solves the equations. */
class Assembly implements Stamp {
  readonly conductances: Conductance[] = [];
  readonly sources: CurrentSource[] = [];
  readonly voltageSources: VoltageSource[] = [];
  readonly junctions: Junction[] = [];
  readonly controlled: Controlled[] = [];
  private owner: Part | undefined;

  constructor(
    readonly time: number,
    readonly dt: number,
    readonly ambient: number,
    private readonly nodeCount: () => number,
    private readonly allocate: (owner: Part, name: string) => Node,
    private readonly guess: (owner: Part, a: Node, b: Node) => number,
  ) {}

  mark(owner: Part): Mark {
    this.owner = owner;
    return {
      conductances: this.conductances.length,
      sources: this.sources.length,
      voltageSources: this.voltageSources.length,
      junctions: this.junctions.length,
      controlled: this.controlled.length,
    };
  }

  rollback(mark: Mark): void {
    this.conductances.length = mark.conductances;
    this.sources.length = mark.sources;
    this.voltageSources.length = mark.voltageSources;
    this.junctions.length = mark.junctions;
    this.controlled.length = mark.controlled;
  }

  internal(name: string): Node {
    return this.allocate(this.currentOwner(), name);
  }

  conductance(a: Node, b: Node, siemens: number): void {
    this.checkNodes(a, b);
    this.checkFinite('conductance', siemens, 'is a resistance set to 0 Ω?');
    this.conductances.push({ a, b, siemens, owner: this.currentOwner() });
  }

  currentSource(from: Node, to: Node, amps: number): void {
    this.checkNodes(from, to);
    this.checkFinite('current', amps);
    this.sources.push({ from, to, amps, owner: this.currentOwner() });
  }

  voltageSource(plus: Node, minus: Node, volts: number): Branch {
    this.checkNodes(plus, minus);
    this.checkFinite('voltage', volts);
    this.voltageSources.push({ plus, minus, volts, owner: this.currentOwner() });
    return (this.voltageSources.length - 1) as Branch;
  }

  junction(anode: Node, cathode: Node, curve: Curve): void {
    this.checkNodes(anode, cathode);
    const guessed = this.linearise(anode, cathode, curve);
    this.junctions.push({ ...guessed, slope: Math.max(guessed.slope, GMIN) });
  }

  controlledCurrent(from: Node, to: Node, plus: Node, minus: Node, curve: Curve): void {
    this.checkNodes(from, to, plus, minus);
    this.controlled.push({ ...this.linearise(plus, minus, curve), from, to });
  }

  /** The curve at this part's guess for the voltage from a to b, as a straight line. */
  private linearise(a: Node, b: Node, curve: Curve): Guessed {
    const owner = this.currentOwner();
    const volts = this.guess(owner, a, b);
    const amps = curve.current(volts);
    const slope = curve.slope(volts);
    this.checkFinite('current()', amps, `at ${String(volts)} V`);
    this.checkFinite('slope()', slope, `at ${String(volts)} V`);
    return { a, b, curve, volts, amps, slope, owner };
  }

  /** Modified nodal analysis: one equation per node, plus one per voltage source. */
  solve(nodes: number): Float64Array {
    const { matrix, rhs, size } = this.equations(nodes);
    return solveInPlace(matrix, rhs, size);
  }

  /**
   * Ohms between two nodes as these stamps describe the circuit: with every source turned off (a voltage source as a
   * short, a current source as a gap) and each curve straightened at its guess, the volts it takes to push 1 A in at
   * `a` and out at `b`.
   */
  resistance(nodes: number, a: Node, b: Node): number {
    return this.resistances(nodes, [[a, b]])[0] ?? Infinity;
  }

  /** The same for several pairs of nodes, from one elimination: a pin per pair, a microcontroller's worth at once. */
  resistances(nodes: number, pairs: readonly (readonly [Node, Node])[]): number[] {
    const { matrix, size } = this.equations(nodes);
    const pushes = pairs.map(([a, b]) => {
      const push = new Float64Array(size);
      if (a !== GROUND) push[a - 1] += 1;
      if (b !== GROUND) push[b - 1] -= 1;
      return push;
    });
    const volts = solveAllInPlace(matrix, pushes, size);
    return pairs.map(([a, b], i) => (a === b ? 0 : voltageIn(volts[i] ?? new Float64Array(), a) - voltageIn(volts[i] ?? new Float64Array(), b)));
  }

  /** The equations for one solve: a matrix of conductances and voltage-source rows, and what's pushed into each. */
  private equations(nodes: number): { matrix: Float64Array; rhs: Float64Array; size: number } {
    const size = nodes + this.voltageSources.length;
    const matrix = new Float64Array(size * size);
    const rhs = new Float64Array(size);

    const addConductance = (a: Node, b: Node, g: number): void => {
      if (a !== GROUND) matrix[(a - 1) * size + (a - 1)] += g;
      if (b !== GROUND) matrix[(b - 1) * size + (b - 1)] += g;
      if (a !== GROUND && b !== GROUND) {
        matrix[(a - 1) * size + (b - 1)] -= g;
        matrix[(b - 1) * size + (a - 1)] -= g;
      }
    };
    const addCurrent = (from: Node, to: Node, amps: number): void => {
      if (from !== GROUND) rhs[from - 1] -= amps;
      if (to !== GROUND) rhs[to - 1] += amps;
    };

    for (let i = 0; i < nodes; i++) matrix[i * size + i] += GMIN;
    for (const c of this.conductances) addConductance(c.a, c.b, c.siemens);
    for (const s of this.sources) addCurrent(s.from, s.to, s.amps);
    for (const j of this.junctions) {
      // Near its guess the curve is a straight line: a conductance plus a fixed current.
      addConductance(j.a, j.b, j.slope);
      addCurrent(j.a, j.b, j.amps - j.slope * j.volts);
    }
    for (const c of this.controlled) {
      // The same straight line, but the current it gives flows between two other nodes: it leaves `from` and
      // arrives at `to` in proportion to the voltage from a to b. That's the one entry in the matrix that isn't
      // mirrored across its diagonal; the elimination doesn't need it to be.
      for (const [node, sign] of [
        [c.from, 1],
        [c.to, -1],
      ] as const) {
        if (node === GROUND) continue;
        if (c.a !== GROUND) matrix[(node - 1) * size + (c.a - 1)] += sign * c.slope;
        if (c.b !== GROUND) matrix[(node - 1) * size + (c.b - 1)] -= sign * c.slope;
      }
      addCurrent(c.from, c.to, c.amps - c.slope * c.volts);
    }
    for (const [k, s] of this.voltageSources.entries()) {
      const row = nodes + k;
      if (s.plus !== GROUND) {
        matrix[(s.plus - 1) * size + row] += 1;
        matrix[row * size + (s.plus - 1)] += 1;
      }
      if (s.minus !== GROUND) {
        matrix[(s.minus - 1) * size + row] -= 1;
        matrix[row * size + (s.minus - 1)] -= 1;
      }
      rhs[row] = s.volts;
    }

    return { matrix, rhs, size };
  }

  private currentOwner(): Part {
    if (!this.owner) throw new Error('A stamp was made outside a part');
    return this.owner;
  }

  private checkNodes(...nodes: Node[]): void {
    const count = this.nodeCount();
    for (const node of nodes) {
      if (!Number.isInteger(node) || node < 0 || node > count) {
        throw new PartFailed(this.currentOwner().name, 'stamp', `node ${String(node)} isn't in this circuit`);
      }
    }
  }

  private checkFinite(what: string, value: number, hint = ''): void {
    if (Number.isFinite(value)) return;
    const suffix = hint ? ` (${hint})` : '';
    throw new PartFailed(this.currentOwner().name, 'stamp', `${what} is ${String(value)}${suffix}`);
  }
}
