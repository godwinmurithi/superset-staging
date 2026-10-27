/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from 'react';
// This codebase pins react@17 (see CLAUDE.md's frontend-modernization
// section) -- useSyncExternalStore is a React 18 addition and does not exist
// on the real 'react' package here (confirmed the hard way: production
// webpack build compiles cleanly regardless, since bundling doesn't check
// hook existence -- the TypeError only surfaces at render time). The React
// team's own shim (already a transitive dependency via react-redux) provides
// the identical API and is the standard way to use this hook pre-React-18.
// eslint-disable-next-line import/no-extraneous-dependencies
import { useSyncExternalStore } from 'use-sync-external-store/shim';
import {
  DndContext,
  DragEndEvent,
  DragMoveEvent,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragDroppableComponent, DragItem } from './dragDroppableConfig';
import { createMonitorShim } from './monitorShim';
import { hitTestDragDroppables } from './dragDroppableRegistry';
import handleDrop from './handleDrop';

/**
 * Phase 8 migration (react-dnd -> @dnd-kit). Dashboard layout drag-drop
 * deliberately does NOT use @dnd-kit's own useDroppable/collision detection
 * for hit-testing -- that API resolves exactly one "over" winner per move,
 * whereas the original getDropPosition algorithm depends on MULTIPLE nested
 * DOM ancestors simultaneously knowing the pointer is over them (a dragged
 * row over a chart nested inside another row needs the outer row's sibling
 * indicator to show too, not just the chart's). Reimplementing that as a
 * custom collision-detection function would fight the library's model.
 * Instead, this provider exposes raw pointer state (client offset + the
 * dragging item's payload) via a store every DragDroppable instance reads
 * and does its own getBoundingClientRect() comparison against -- the same
 * shape of computation getDropPosition.ts already did, just fed pointer data
 * directly instead of through a react-dnd monitor object.
 *
 * `hitStack` (added alongside the original two fields): react-dnd got
 * "which nested targets are currently under the pointer, innermost first"
 * for free from native DOM event bubbling. That information doesn't exist
 * any other way under @dnd-kit, so it's computed HERE, once per move tick,
 * via `document.elementsFromPoint()` (see `dragDroppableRegistry.ts`) and
 * published alongside the raw pointer data -- one DOM query per tick, not
 * one per mounted DragDroppable instance, and every subscriber (each
 * DragDroppable's own isDraggingOver/isDraggingOverShallow derivation, plus
 * this file's own drop dispatch below) reads the same computed array
 * instead of each re-deriving it.
 */

interface PointerState {
  draggingItem: DragItem | null;
  clientOffset: { x: number; y: number } | null;
  /** Innermost-first. Empty when nothing is being dragged. */
  hitStack: DragDroppableComponent[];
}

const EMPTY_STATE: PointerState = {
  draggingItem: null,
  clientOffset: null,
  hitStack: [],
};

class PointerStore {
  private state: PointerState = EMPTY_STATE;

  private listeners = new Set<() => void>();

  getState = (): PointerState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  set(next: PointerState): void {
    this.state = next;
    this.listeners.forEach(listener => listener());
  }

  clear(): void {
    this.set(EMPTY_STATE);
  }
}

const DndKitPointerContext = createContext<PointerStore | null>(null);

/**
 * Live pointer/dragging-item/hit-stack state for the currently active drag,
 * or the empty state when nothing is being dragged.
 * Re-renders only the calling component on change (useSyncExternalStore),
 * not the whole tree -- this fires on every pointer move during a drag, so
 * that matters.
 */
export function useDndKitPointer(): PointerState {
  const store = useContext(DndKitPointerContext);
  if (!store) {
    throw new Error('useDndKitPointer must be used within DndKitProvider');
  }
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

interface DndKitProviderProps {
  children: ReactNode;
  onDragEndItem?: (
    item: DragItem,
    clientOffset: { x: number; y: number } | null,
  ) => void;
}

export default function DndKitProvider({
  children,
  onDragEndItem,
}: DndKitProviderProps) {
  const storeRef = useRef<PointerStore>();
  if (!storeRef.current) {
    storeRef.current = new PointerStore();
  }
  const store = storeRef.current;

  // PointerSensor covers mouse/touch (react-dnd-html5-backend's replacement);
  // KeyboardSensor is new -- react-dnd's HTML5 backend had no keyboard path
  // at all, so this is a real accessibility gain, not parity work. Matches
  // the plan's own Phase 8 requirement ("every drag operation must work by
  // keyboard"), tested in DragDroppable's keyboard handling.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor),
  );

  const clientOffsetFromEvent = useCallback(
    (
      event: DragMoveEvent | DragStartEvent | DragEndEvent,
    ): { x: number; y: number } | null => {
      const rect =
        event.active.rect.current.translated ??
        event.active.rect.current.initial;
      if (!rect) return null;
      // Center of the dragged element's current rect approximates react-dnd's
      // getClientOffset() (raw pointer position) closely enough for the
      // threshold-based comparisons in getDropPosition.ts -- both are used
      // only for "which side of the target am I on", not pixel-exact
      // pointer tracking.
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    },
    [],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const item = event.active.data.current as DragItem | undefined;
      if (!item) return;
      const clientOffset = clientOffsetFromEvent(event);
      const hitStack = clientOffset
        ? hitTestDragDroppables(clientOffset.x, clientOffset.y)
        : [];
      store.set({ draggingItem: item, clientOffset, hitStack });
    },
    [store, clientOffsetFromEvent],
  );

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const item = event.active.data.current as DragItem | undefined;
      if (!item) return;
      const clientOffset = clientOffsetFromEvent(event);
      const hitStack = clientOffset
        ? hitTestDragDroppables(clientOffset.x, clientOffset.y)
        : [];
      store.set({ draggingItem: item, clientOffset, hitStack });
    },
    [store, clientOffsetFromEvent],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const item = event.active.data.current as DragItem | undefined;
      const clientOffset = clientOffsetFromEvent(event);
      const hitStack = clientOffset
        ? hitTestDragDroppables(clientOffset.x, clientOffset.y)
        : [];

      // The innermost matching target performs the drop -- direct
      // equivalent of react-dnd's bubble-phase "most-nested target wins"
      // rule (see the removed dropConfig.drop's own comment about
      // monitor.getDropResult()/didDrop()), except resolved here via a
      // real, single DOM hit-test rather than relying on react-dnd's
      // internal event-bubbling order.
      if (item && hitStack.length > 0) {
        const target = hitStack[0];
        const monitor = createMonitorShim(
          () => item,
          () => clientOffset,
        );
        if (target.mounted) {
          handleDrop(target.props, monitor, target);
        }
      }

      // store.clear() happens AFTER handleDrop and the onDragEndItem
      // callback below run -- both need `item`/`clientOffset` while they're
      // still valid, matching the reasoning in getDropPosition.ts's own
      // CACHED_CLIENT_OFFSET comment ("we do not have access to it during
      // drop because ... returns null at this point"). Doing the dispatch
      // here, synchronously, from the real event data, avoids needing that
      // kind of cache at all for the drop (as opposed to hover) path.
      store.clear();
      if (item) {
        onDragEndItem?.(item, clientOffset);
      }
    },
    [store, onDragEndItem, clientOffsetFromEvent],
  );

  const handleDragCancel = useCallback(() => {
    store.clear();
  }, [store]);

  const contextValue = useMemo(() => store, [store]);

  return (
    <DndKitPointerContext.Provider value={contextValue}>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children}
      </DndContext>
    </DndKitPointerContext.Provider>
  );
}
