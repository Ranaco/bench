/// <reference lib="webworker" />
/**
 * A trial run for a part's code, off the page's thread: a part built from it, in a small circuit, stepped for a few
 * milliseconds. Mistakes are fine here (the board shows those); what this is for is code that never finishes, which
 * would freeze the page if the board ran it.
 */
import { Circuit, DEFAULTS, GROUND, loadModule, Resistor, Supply, type ModuleId, type ModuleSource } from '@bench/engine';
import { KINDS } from '../kinds/models';
import type { PartKind } from '../builder/board';

export interface TrialRequest {
  readonly id: number;
  readonly module: ModuleId;
  readonly source: ModuleSource;
}

export interface TrialReply {
  readonly id: number;
}

/** A kind of part that runs each module's code. */
const KIND_OF: Readonly<Record<ModuleId, PartKind>> = {
  battery: 'battery',
  resistor: 'resistor',
  led: 'led',
  switch: 'button',
  'slide-switch': 'switch',
  potentiometer: 'knob',
  capacitor: 'capacitor',
  electrolytic: 'capacitor',
  transistor: 'transistor',
  gpio: 'esp32',
  esp32: 'esp32',
  diode: 'diode',
  motor: 'motor',
};

function trial({ module, source }: TrialRequest): void {
  const code = { ...DEFAULTS, [module]: loadModule(module, source, DEFAULTS) };
  const kind = KINDS[KIND_OF[module]];
  const c = new Circuit();
  const top = c.node('top');
  c.add(new Supply('V1', top, GROUND, 3));
  const nodes: Record<string, ReturnType<Circuit['node']>> = {};
  kind.pins.forEach((pin, i) => {
    const node = c.node(pin.id);
    nodes[pin.id] = node;
    c.add(new Resistor(`R${String(i)}`, node, i === 0 ? top : GROUND, 1000));
  });
  c.add(kind.create('T1', nodes, kind.defaults, code));
  for (let i = 0; i < 20; i++) c.step(0.001);
}

self.onmessage = (event: MessageEvent<TrialRequest>) => {
  try {
    trial(event.data);
  } catch {
    // A mistake, not a freeze: the board will say what it is.
  }
  self.postMessage({ id: event.data.id } satisfies TrialReply);
};
