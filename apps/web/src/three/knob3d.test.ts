import { KNOB_10K } from '@bench/engine';
import { describe, expect, it } from 'vitest';
import { LIFT, buildKnob } from './buildKnob';
import { OUTSIDE, angleStep, carbon, flatAngle, pieces, settle, turnForDegrees, wiperAngle, wiperAlong } from './knob3d';
import { PIECE_IDS, PIECES } from './pieces';
import * as THREE from 'three';

describe('the knob in 3D', () => {
  it('is the size the datasheet’s drawing prints', () => {
    const printed = Object.values(OUTSIDE).filter((size) => size.source === 'printed');
    expect(printed.map((size) => size.mm)).toEqual(
      expect.arrayContaining([10, 5.5, 6.8, 1.1, 11.4, 10.6, 2, 3.8, 6, 15, 6, 4.5, 2.5, 1.5, 1, 7]),
    );
    // The pins' tips fit the 1.0 mm holes the datasheet's board layout gives them, corner to corner.
    expect(Math.hypot(OUTSIDE.pinTipWidth.mm, OUTSIDE.pinThickness.mm)).toBeLessThan(OUTSIDE.pinHole.mm);
    // The ears sit over their slots in the board layout.
    const earCentre = (OUTSIDE.earsAcross.mm + OUTSIDE.bodyWidth.mm) / 2;
    expect(Math.abs(earCentre - OUTSIDE.earSlots.mm)).toBeLessThan(0.2);
    // The flat leaves 4.5 of the 6.0 shaft: it's cut 1.5 mm from the centre.
    expect(OUTSIDE.flatLeaves.mm - OUTSIDE.shaftDiameter.mm / 2).toBe(1.5);
  });

  it('turns as far as the datasheet says, from where the drawing shows it', () => {
    // Full anticlockwise: the flat faces 40° clockwise from the top. In the middle it faces the pins.
    expect(flatAngle(0)).toBe(40);
    expect(flatAngle(0.5)).toBe(180);
    expect(wiperAlong(1) - wiperAlong(0)).toBe(KNOB_10K.turnDegrees);
    // The wiper is opposite the flat: at the top in the middle, next to pin 1's end at the start.
    expect(wiperAngle(0.5)).toBe(0);
    expect(wiperAngle(0)).toBe(220);
    expect(wiperAngle(1)).toBe(140);
  });

  it('has carbon only between 5 % and 95 % of the turn, like the taper', () => {
    const { from, to } = carbon();
    expect(from - wiperAlong(0)).toBeCloseTo(KNOB_10K.deadZone * KNOB_10K.turnDegrees, 9);
    expect(wiperAlong(1) - to).toBeCloseTo(KNOB_10K.deadZone * KNOB_10K.turnDegrees, 9);
    // In the dead zone the wiper sits on the silver end: the piece to pin 1 has no carbon in it.
    const start = pieces(0.02);
    expect(start.toPin1[1] - start.toPin1[0]).toBe(0);
    // Halfway, the two pieces are the same length, and they always add up to all the carbon.
    const half = pieces(0.5);
    expect(half.toPin1[1] - half.toPin1[0]).toBeCloseTo(half.toPin3[1] - half.toPin3[0], 9);
    for (const turn of [0, 0.1, 0.37, 0.5, 0.9, 1]) {
      const { toPin1, toPin3 } = pieces(turn);
      expect(toPin1[1] - toPin1[0] + (toPin3[1] - toPin3[0])).toBeCloseTo(to - from, 9);
    }
  });

  it('turns by dragging round the shaft, and stops at the ends', () => {
    expect(turnForDegrees(KNOB_10K.turnDegrees)).toBe(1);
    expect(settle(0.5 + turnForDegrees(70))).toBe(0.75);
    expect(settle(-0.2)).toBe(0);
    expect(settle(1.4)).toBe(1);
    // Dragging across the ±180° line is a small step, not a whole turn.
    expect(angleStep(175, -175)).toBe(10);
    expect(angleStep(-175, 175)).toBe(-10);
  });

  it('has every piece, each explained, and takes apart upwards', () => {
    const model = buildKnob();
    for (const id of PIECE_IDS) {
      expect(model.pickables.some((mesh) => model.pieceOf(mesh) === id)).toBe(true);
      expect(PIECES[id].does.length).toBeGreaterThan(20);
      expect(PIECES[id].source.length).toBeGreaterThan(20);
    }
    const shaft = model.root.getObjectByName('shaft');
    const housing = model.root.getObjectByName('housing');
    model.setExplode(1);
    expect(shaft?.position.y).toBe(LIFT.shaft);
    expect(housing?.position.y).toBe(0);
    model.setExplode(0);
    expect(shaft?.position.y).toBe(0);
    model.dispose();
  });

  it('stands on its back with the shaft up, its tip where the drawing puts it', () => {
    const model = buildKnob();
    const shaft = model.root.getObjectByName('shaft');
    if (!shaft) throw new Error('no shaft');
    const box = new THREE.Box3().setFromObject(shaft);
    expect(box.max.y).toBeCloseTo(OUTSIDE.shaftLength.mm, 6);
    expect(box.max.x - box.min.x).toBeCloseTo(OUTSIDE.shaftDiameter.mm, 1);
    const body = new THREE.Box3().setFromObject(model.root);
    expect(body.min.y).toBeCloseTo(-OUTSIDE.earsBelow.mm, 6); // the tips of the ears' legs
    model.dispose();
  });

  it('sweeps the wiper round with the shaft', () => {
    const model = buildKnob();
    const wiper = model.root.getObjectByName('wiper');
    model.setTurn(0);
    expect(wiper?.rotation.y).toBeCloseTo((-220 * Math.PI) / 180, 9);
    model.setTurn(1);
    expect(wiper?.rotation.y).toBeCloseTo((-500 * Math.PI) / 180, 9);
    model.dispose();
  });
});
