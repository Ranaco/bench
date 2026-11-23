import * as THREE from 'three';

/**
 * Shapes the models are built from, all in millimetres, y up (docs/3d.md §2).
 * Angles round an axis are "clockwise from the back, looking down", the way a
 * datasheet's front view is drawn: 0° is −z, 90° is +x.
 */

const deg = (d: number) => (d * Math.PI) / 180;

export function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(x, y, z);
  return geometry;
}

/** An upright cylinder from y0 to y1, centred on (x, z). */
export function cylinder(radius: number, y0: number, y1: number, x = 0, z = 0, segments = 48): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(radius, radius, y1 - y0, segments);
  geometry.translate(x, (y0 + y1) / 2, z);
  return geometry;
}

/** An upright tube (open at both ends) from y0 to y1. */
export function tube(outer: number, inner: number, y0: number, y1: number, x = 0, z = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
  shape.holes.push(circle(inner));
  const geometry = extrudeUp(shape, y0, y1 - y0);
  geometry.translate(x, 0, z);
  return geometry;
}

/** A flat ring lying face up, between two angles (degrees, see above). */
export function ringArc(inner: number, outer: number, from: number, to: number): THREE.BufferGeometry {
  const span = Math.max(to - from, 0.001);
  const geometry = new THREE.RingGeometry(inner, outer, Math.max(8, Math.ceil(span / 3)), 1, deg(90 - to), deg(span));
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** A shape pushed up from height `y0` by `height`: the shape's x is the model's x, its y the model's −z. */
export function extrudeUp(shape: THREE.Shape, y0: number, height: number, bevel = 0): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height - 2 * bevel,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelOffset: -bevel, // round the edges inwards, so the outline keeps its size
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 48,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y0 + bevel, 0);
  return geometry;
}

export function rect(halfX: number, halfY: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-halfX, -halfY);
  s.lineTo(halfX, -halfY);
  s.lineTo(halfX, halfY);
  s.lineTo(-halfX, halfY);
  s.closePath();
  return s;
}

export function circle(radius: number): THREE.Path {
  const p = new THREE.Path();
  p.absarc(0, 0, radius, 0, Math.PI * 2, false);
  return p;
}

/** A unit direction for an angle clockwise from the back (degrees): [x, z]. */
export function direction(degrees: number): readonly [number, number] {
  const r = deg(degrees);
  return [Math.sin(r), -Math.cos(r)];
}
