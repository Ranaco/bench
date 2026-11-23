import { invalidate } from '@react-three/fiber';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type * as THREE from 'three';
import { boxOf, type Model3d } from '../core/model';
import type { StageHandle } from './PartStage';
import { useTween } from './tween';

/** How long taking a part apart (or putting it back) takes, ms. */
const APART_MS = 650;

/** The model's box with `set` applied, then put back with `restore`: where the camera should end up. */
export function boxAt(model: Model3d, set: () => void, restore: () => void): THREE.Box3 {
  set();
  const box = boxOf(model);
  restore();
  return box;
}

/**
 * What every part in 3D keeps track of: the piece you're pointing at, the one
 * you've picked, what's hidden, and whether it's taken apart (eased, with the
 * camera gliding to frame it).
 */
export function usePart<P extends string>(model: Model3d<P>, stage: RefObject<StageHandle | null>) {
  const [hovered, setHovered] = useState<P | undefined>(undefined);
  const [selected, setSelected] = useState<P | undefined>(undefined);
  const [hidden, setHidden] = useState<ReadonlySet<P>>(new Set());
  const [apart, setApart] = useState(false);
  // Whether it's more than half apart: labels on the inside only make sense once you can see in.
  const [opened, setOpened] = useState(false);
  const openedNow = useRef(false);
  const explode = useTween(apart ? 1 : 0, APART_MS, (value) => {
    model.setExplode(value);
    const open = value > 0.6;
    if (open !== openedNow.current) {
      openedNow.current = open;
      setOpened(open);
    }
  });

  // A new model (another size) starts as taken apart as the last one was.
  useEffect(() => {
    model.setExplode(explode.current);
    invalidate();
  }, [model, explode]);

  /**
   * Takes it apart or puts it back, framing where it'll end up. `also` sets anything else that changes with it (a
   * capacitor rolling back up) for the framing, and `undo` puts that back, so nothing jumps before it eases.
   */
  const setApartTo = (on: boolean, also: () => void = () => undefined, undo: () => void = () => undefined) => {
    const target = on ? 1 : 0;
    stage.current?.frame(
      boxAt(
        model,
        () => {
          model.setExplode(target);
          also();
        },
        () => {
          model.setExplode(explode.current);
          undo();
        },
      ),
    );
    setApart(on);
  };

  return {
    hovered,
    setHovered: (piece: string | undefined) => {
      setHovered(piece as P | undefined);
    },
    selected,
    setSelected: (piece: string | undefined) => {
      setSelected(piece as P | undefined);
    },
    hidden,
    toggleHidden: (piece: string) => {
      setHidden((was) => {
        const next = new Set(was);
        if (!next.delete(piece as P)) next.add(piece as P);
        return next;
      });
    },
    showAll: () => {
      setHidden(new Set());
    },
    apart,
    opened,
    setApartTo,
    reset: () => stage.current?.reset(),
  };
}
