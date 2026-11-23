import { AdaptiveDpr, CameraControls, ContactShadows, Environment, Html, Lightformer } from '@react-three/drei';
import { Canvas, createPortal, useThree, type ThreeEvent } from '@react-three/fiber';
import { Fragment, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type Ref } from 'react';
import * as THREE from 'three';
import { boxOf, type Model3d } from '../core/model';
import { MM } from '../core/units';
import { reducedMotion } from './tween';

/** A label pinned to a point on the model, drawn as page text so it stays sharp and readable. */
export interface StageLabel {
  readonly key: string;
  readonly anchor: THREE.Object3D;
  readonly text: string;
  /** A colour swatch beside the text, for labels keyed to a tint. */
  readonly tint?: string;
}

/** What a drag gets: the camera, and where the 3D view sits on the page. */
export interface DragView {
  readonly camera: THREE.Camera;
  readonly rect: DOMRect;
}

/** A piece you can drag to work the part (a knob's shaft): the camera stays still while you do (docs/3d.md §6). */
export interface DragHandler {
  readonly pieces: ReadonlySet<string>;
  start(event: PointerEvent, view: DragView): void;
  move(event: PointerEvent, view: DragView): void;
  end(): void;
}

export interface StageHandle {
  /** Back to the starting view of the model as it is now. */
  reset(): void;
  /** Glides to frame `box` (world units). */
  frame(box: THREE.Box3): void;
}

interface PartStageProps {
  readonly model: Model3d;
  readonly hidden: ReadonlySet<string>;
  readonly hovered: string | undefined;
  readonly selected: string | undefined;
  readonly onHover: (piece: string | undefined) => void;
  readonly onSelect: (piece: string | undefined) => void;
  readonly labels: readonly StageLabel[];
  readonly drag?: DragHandler;
  readonly handle: Ref<StageHandle>;
  /**
   * Changes whenever the part changes shape (taken apart, unrolled, another size). The shadow under it depends only
   * on its shape, not on where you look from, so it's drawn again only then, for long enough to follow the change.
   */
  readonly shapeKey: string;
}

/** Where the camera looks from at the start: in front, a little to the right, and above (degrees). */
const START = { azimuth: 28, polar: 62 };
/** How many frames the shadow is drawn for after the part changes shape: enough to follow it coming apart. */
const SHADOW_FRAMES = 60;
/** Pixels a press can wander and still count as a click. */
const CLICK_SLOP = 4;
/** A box as the sphere round it: framing a sphere keeps the angle the camera looks from (a box snaps it square on). */
const sphereOf = (box: THREE.Box3) => box.getBoundingSphere(new THREE.Sphere());

/** How much of the view the title and buttons cover at the top, and the readings and pieces at the bottom, px. */
function insetsOf(canvas: HTMLCanvasElement): { top: number; bottom: number; height: number } {
  const viewer = canvas.closest('.viewer');
  const height = canvas.clientHeight || 1;
  const top = viewer?.querySelector('.viewer-top')?.getBoundingClientRect().height ?? 0;
  const bottom = viewer?.querySelector('.viewer-foot')?.getBoundingClientRect().height ?? 0;
  // Never let them claim so much that the part has nowhere left to go.
  const scale = Math.min(1, (0.6 * height) / Math.max(top + bottom, 1));
  return { top: top * scale, bottom: bottom * scale, height };
}

/**
 * Frames a box in the part of the view the title, buttons, readings and pieces leave clear: smaller by however much
 * they cover, and moved to sit in the middle of what's left.
 */
function frameBox(controls: CameraControls | null, canvas: HTMLCanvasElement, box: THREE.Box3, smooth: boolean) {
  if (!controls) return;
  const camera = controls.camera as THREE.PerspectiveCamera;
  const { top, bottom, height } = insetsOf(canvas);
  const clear = Math.max(height - top - bottom, 1);
  const sphere = sphereOf(box);
  const grown = new THREE.Sphere(sphere.center, sphere.radius * (height / clear));
  void controls.fitToSphere(grown, smooth);
  // How far that leaves the camera, as fitToSphere works it out (the narrower of the two fields of view), then the
  // world size of one pixel there: the middle of the clear part is (bottom − top) / 2 px above the view's middle.
  // A positive focal offset slides the picture up the screen.
  const vertical = THREE.MathUtils.degToRad(camera.fov);
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
  const distance = grown.radius / Math.sin(Math.min(vertical, horizontal) / 2);
  const perPixel = (2 * distance * Math.tan(vertical / 2)) / height;
  void controls.setFocalOffset(0, ((bottom - top) / 2) * perPixel, 0, smooth);
}

const shown = (object: THREE.Object3D | null): boolean => !object || (object.visible && shown(object.parent));
const setEnabled = (controls: CameraControls | null, on: boolean) => {
  if (controls) controls.enabled = on;
};

/**
 * A part on its own, in 3D (docs/3d.md §5): lit by a studio made in code,
 * Neutral tone mapping, a soft contact shadow, drawn only when something
 * changes. Drag to look round it, scroll or pinch to zoom; point at a piece to
 * light it up, click to pick it.
 */
export function PartStage(props: PartStageProps) {
  return (
    <Canvas
      onPointerMissed={() => {
        props.onSelect(undefined); // a click on nothing (R3F leaves out the ends of drags round the model)
      }}
      frameloop="demand"
      dpr={[1, 2]}
      // While the view moves, draw at a lower resolution if frames are slow (a phone, a weak graphics chip).
      performance={{ min: 0.5 }}
      gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1 }}
      camera={{ fov: 30, near: 0.002, far: 3, position: [0.06, 0.05, 0.1] }}
    >
      <Scene {...props} />
    </Canvas>
  );
}

function Scene({ model, hidden, hovered, selected, onHover, onSelect, labels, drag, handle, shapeKey }: PartStageProps) {
  const controls = useRef<CameraControls>(null);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const [ground, setGround] = useState<{ y: number; size: number; x: number; z: number } | undefined>(undefined);
  const lastHover = useRef<string | undefined>(undefined);

  // Frame a box: from the starting angle, or from wherever the camera is now.
  useImperativeHandle(handle, () => ({
    reset() {
      const box = boxOf(model);
      void controls.current?.rotateTo(THREE.MathUtils.degToRad(START.azimuth), THREE.MathUtils.degToRad(START.polar), !reducedMotion());
      frameBox(controls.current, gl.domElement, box, !reducedMotion());
    },
    frame(box) {
      frameBox(controls.current, gl.domElement, box, !reducedMotion());
    },
  }));

  // A new model: frame it from the start, and put the shadow under its lowest point.
  useEffect(() => {
    const box = boxOf(model);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const c = controls.current;
    if (c) {
      void c.rotateTo(THREE.MathUtils.degToRad(START.azimuth), THREE.MathUtils.degToRad(START.polar), false);
      frameBox(c, gl.domElement, box, false);
    }
    const id = requestAnimationFrame(() => {
      setGround({ y: box.min.y - 0.0002, size: Math.max(size.x, size.z) * 3, x: centre.x, z: centre.z });
    });
    invalidate();
    return () => {
      cancelAnimationFrame(id);
    };
  }, [model, invalidate, gl]);

  useEffect(() => {
    model.setHidden(hidden);
    model.setHighlight(hovered, selected);
    invalidate();
  }, [model, hidden, hovered, selected, invalidate]);

  const pieceAt = (event: ThreeEvent<PointerEvent | MouseEvent>) => (shown(event.object) ? model.pieceOf(event.object) : undefined);

  const hover = (piece: string | undefined) => {
    if (piece === lastHover.current) return;
    lastHover.current = piece;
    onHover(piece);
  };

  // A drag on the handle: listen on the page itself, so it keeps going wherever the pointer wanders.
  const startDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!drag) return false;
    const view = () => ({ camera, rect: gl.domElement.getBoundingClientRect() });
    const id = event.pointerId;
    setEnabled(controls.current, false);
    drag.start(event.nativeEvent, view());
    const move = (e: PointerEvent) => {
      if (e.pointerId === id) drag.move(e, view());
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setEnabled(controls.current, true);
      drag.end();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return true;
  };

  return (
    <>
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 4, 4]} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-5, 2, 0]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="ring" intensity={1.6} position={[4, 3, -4]} scale={3} />
        <Lightformer form="rect" intensity={0.4} position={[0, -5, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
      </Environment>
      <directionalLight position={[0.3, 0.6, 0.4]} intensity={1.2} />
      <CameraControls ref={controls} makeDefault regress minDistance={0.015} maxDistance={0.6} />
      <AdaptiveDpr />

      <group scale={MM}>
        <primitive
          object={model.root}
          onPointerMove={(event: ThreeEvent<PointerEvent>) => {
            const piece = pieceAt(event);
            if (!piece) return;
            event.stopPropagation();
            hover(piece);
          }}
          onPointerOut={() => {
            hover(undefined);
          }}
          onPointerDown={(event: ThreeEvent<PointerEvent>) => {
            const piece = pieceAt(event);
            if (!piece) return;
            event.stopPropagation();
            if (drag?.pieces.has(piece) && startDrag(event)) onSelect(piece);
          }}
          onClick={(event: ThreeEvent<MouseEvent>) => {
            const piece = pieceAt(event);
            if (!piece) return;
            event.stopPropagation();
            if (event.delta <= CLICK_SLOP) onSelect(piece);
          }}
        />
        {/* Keyed, so a label keeps its place in the page from one render to the next instead of being made again. */}
        {labels.map((label) => (
          <Fragment key={label.key}>
            {createPortal(
              <Html center pointerEvents="none" zIndexRange={[5, 0]}>
                <span className={label.tint ? 'viewer-tag piece' : 'viewer-tag'} style={label.tint ? ({ '--tint': label.tint } as CSSProperties) : undefined}>
                  {label.text}
                </span>
              </Html>,
              label.anchor,
              undefined,
            )}
          </Fragment>
        ))}
      </group>

      {ground && (
        <ContactShadows
          key={shapeKey}
          frames={SHADOW_FRAMES}
          position={[ground.x, ground.y, ground.z]}
          scale={ground.size}
          blur={2.4}
          far={ground.size / 3}
          opacity={0.55}
          resolution={512}
        />
      )}
    </>
  );
}
