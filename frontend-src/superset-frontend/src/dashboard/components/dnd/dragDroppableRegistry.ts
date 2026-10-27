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
import type { DragDroppableComponent } from './dragDroppableConfig';

/**
 * Phase 8 migration (react-dnd -> @dnd-kit). Under react-dnd, the browser's
 * own DOM event bubbling gave each nested `DropTarget` a free, correct
 * "innermost first" ordering for hover/drop resolution. `@dnd-kit`'s
 * collision detection resolves exactly one "over" droppable per move,
 * which is why `DndKitProvider.tsx` doesn't use `useDroppable` at all (see
 * its own docstring) -- multiple nested ancestors need to know about a
 * drag simultaneously (a row's own sibling indicator, plus a chart nested
 * two levels inside it, at the same time).
 *
 * This registry plus `document.elementsFromPoint()` (in `DndKitProvider`)
 * replace that lost DOM-bubbling-order information: `elementsFromPoint`
 * already returns elements in innermost-first order, matching exactly what
 * react-dnd's bubble phase gave for free. Each mounted `DragDroppable`
 * registers its own outer DOM node (the one carrying
 * `data-test="dragdroppable-object"`) here so the provider can map a
 * hit-tested DOM node back to the component instance `handleHover`/
 * `handleDrop` need (they were written for react-dnd's HOC pattern, which
 * always had direct access to the decorated component instance).
 */
const registry = new Map<HTMLElement, DragDroppableComponent>();

export function registerDragDroppable(
  node: HTMLElement,
  component: DragDroppableComponent,
): void {
  registry.set(node, component);
}

export function unregisterDragDroppable(node: HTMLElement): void {
  registry.delete(node);
}

export function getDragDroppableAt(
  node: HTMLElement,
): DragDroppableComponent | undefined {
  return registry.get(node);
}

/** Innermost-first list of registered DragDroppable instances under (x, y). */
export function hitTestDragDroppables(
  x: number,
  y: number,
): DragDroppableComponent[] {
  if (typeof document.elementsFromPoint !== 'function') return [];
  const elements = document.elementsFromPoint(x, y);
  const hits: DragDroppableComponent[] = [];
  elements.forEach(element => {
    const component = registry.get(element as HTMLElement);
    if (component) hits.push(component);
  });
  return hits;
}
