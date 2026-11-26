import type { DriverModel, Outputs } from '@bench/engine';
import type { ChannelReading, DriveMode } from '../../sim/readings';
import { readingsOf } from '../esp32/model';
import { defineKind } from '../kind';
import { DRIVER_BODY, DRIVER_PINS } from './board';

/** What two outputs do to a motor across them. Undefined for a mix with one output off: the table never gives one. */
export function driveMode([out1, out2]: Outputs): DriveMode | undefined {
  if (out1 === 'off' && out2 === 'off') return 'coast';
  if (out1 === 'off' || out2 === 'off') return undefined;
  if (out1 === out2) return 'brake'; // both ends of the motor joined, through two switches
  return out1 === 'high' ? 'forward' : 'reverse';
}

export const driver = defineKind<DriverModel>({
  kind: 'driver',
  name: 'Motor driver',
  tile: 'Driver',
  blurb: 'A TB6612FNG: runs two motors either way, three pins each',
  pins: DRIVER_PINS.map(({ id, name, x, y }) => ({ id, name, x, y })),
  box: { x: -DRIVER_BODY.halfX - 20, y: -DRIVER_BODY.halfY, width: 2 * DRIVER_BODY.halfX + 40, height: 2 * DRIVER_BODY.halfY },
  defaults: {},
  modules: ['driver'],
  create: (label, nodes, _props, code) =>
    new code.driver(
      label,
      {
        vm: nodes.vm,
        vcc: nodes.vcc,
        gnd: nodes.gnd,
        stby: nodes.stby,
        a: { in1: nodes.ain1, in2: nodes.ain2, pwm: nodes.pwma, out1: nodes.ao1, out2: nodes.ao2 },
        b: { in1: nodes.bin1, in2: nodes.bin2, pwm: nodes.pwmb, out1: nodes.bo1, out2: nodes.bo2 },
      },
      undefined,
      [nodes.gnd2],
    ),
  read: ({ c, part, written, failed }) => {
    if (!written || failed) return { driver: undefined };
    const readings = readingsOf(c);
    const channel = (index: 0 | 1): ChannelReading => ({
      outputs: part.outputs[index],
      mode: driveMode(part.outputs[index]),
      amps: part.loadAmps(readings, index),
      inputs: part.inputs[index],
    });
    const channels = [channel(0), channel(1)] as const;
    const { spec, pins } = part;
    const motorVolts = c.across(pins.vm, pins.gnd);
    const logicVolts = c.across(pins.vcc, pins.gnd);
    const over =
      channels.some((ch) => Math.abs(ch.amps) > spec.ratedAmps) || motorVolts > spec.maxMotorVolts || logicVolts > spec.maxLogicVolts;
    return {
      volts: motorVolts,
      over,
      driver: { channels, powered: part.powered, awake: part.stby, uncertain: part.uncertain, motorVolts, logicVolts },
    };
  },
});
