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

import { fireEvent } from 'spec/helpers/testing-library';

/**
 * jsdom has no layout engine -- every element's real getBoundingClientRect()
 * is zeroed. @dnd-kit's default collision detection (rectIntersection)
 * resolves `event.over` by comparing the dragged item's measured +
 * translated rect against every droppable's measured rect, so leaving them
 * all at {0,0,0,0} makes which target "wins" undefined. This gives each
 * matching element a distinct, fixed rect so a drag from one to another can
 * be driven deterministically with real pointer coordinates.
 *
 * Matches by substring of the element's own textContent, which also matches
 * on that element's ancestors (anything containing the text). That's
 * intentional, not a limitation: @dnd-kit only ever measures the specific
 * node it was given via useDraggable/useDroppable's setNodeRef, so every
 * other element sharing the same rect is simply never queried for it.
 */
export function mockElementRectsByText(
  entries: Record<string, Partial<DOMRect>>,
): jest.SpiedFunction<typeof HTMLElement.prototype.getBoundingClientRect> {
  const defaultRect: DOMRect = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON: () => {},
  };
  return jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function mockGetBoundingClientRect(this: HTMLElement) {
      const match = Object.entries(entries).find(([text]) =>
        this.textContent?.includes(text),
      );
      return match ? { ...defaultRect, ...match[1] } : defaultRect;
    });
}

/**
 * Same as mockElementRectsByText, but matches specific element references
 * instead of text -- needed when the droppable's registered node (the one
 * @dnd-kit actually measures) is a wrapper with no text of its own, e.g.
 * DndSelectLabel.tsx's outer `<div ref={datasourcePanelDrop}>`, which wraps
 * both the header and the labels container rather than being identifiable
 * by its own text content.
 */
export function mockElementRects(
  entries: [Element, Partial<DOMRect>][],
): jest.SpiedFunction<typeof HTMLElement.prototype.getBoundingClientRect> {
  const defaultRect: DOMRect = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON: () => {},
  };
  return jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function mockGetBoundingClientRect(this: HTMLElement) {
      const match = entries.find(([el]) => el === this);
      return match ? { ...defaultRect, ...match[1] } : defaultRect;
    });
}

/** A `{top, height}` pair turned into a full rect, left/width held fixed. */
export function verticalRect(top: number, height: number): Partial<DOMRect> {
  return {
    top,
    height,
    bottom: top + height,
    left: 0,
    right: 100,
    width: 100,
    y: top,
  };
}

/**
 * Drives a real @dnd-kit pointer drag from `from` to `to`, for components
 * built on useDraggable/useDroppable/useDndMonitor (OptionWrapper.tsx,
 * OptionControls/index.tsx's OptionControlLabel) rather than
 * @dnd-kit/sortable. Three real mechanics this accounts for, each confirmed
 * directly against @dnd-kit/core's source and by tracing actual `over`
 * values through a live run, not assumed from docs:
 *
 * 1. PointerSensor's `activationConstraint: { distance: 4 }` (see
 *    DndKitProvider.tsx) consumes the move that first crosses the threshold
 *    purely as activation -- that event's handler returns before ever
 *    calling `onMove`, so it never reaches `onDragMove`. A small nudge along
 *    the drag's own direction starts the drag before the real path begins.
 * 2. `element` (the actual node moved over) commonly gets unmounted mid-drag
 *    -- e.g. OptionWrapper/OptionControlLabel drop their Tooltip wrapper the
 *    moment `isDragging` flips true, replacing the exact node a stale
 *    reference would still be pointing at. @dnd-kit's own move/up listeners
 *    are attached to `document` (confirmed in PointerSensor's constructor),
 *    not the activator node, so every event after the initial pointerdown
 *    is fired on `document` instead of `element` -- sidesteps the problem
 *    entirely rather than needing to re-query a fresh element reference.
 * 3. @dnd-kit's `over` (which droppable the drag currently resolves to) is
 *    computed one render behind the `translated` rect it's based on, and
 *    jsdom's lack of real frame pacing means a single big jump never lets it
 *    catch up before a test's assertions run. Interpolating through several
 *    intermediate points gives it enough render cycles to settle onto the
 *    real target by the final move -- confirmed empirically: ending at the
 *    exact target coordinates after 5 interpolated steps reliably leaves
 *    `over` resolved to that target, not the drag's own starting point.
 */
export function dragPointer(
  element: Element,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 5,
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  const unit = { x: dx / distance, y: dy / distance };
  // Comfortably clears PointerSensor's activationConstraint (distance: 4,
  // see DndKitProvider.tsx) regardless of how short the real drag path is.
  // A fixed overshoot-safe magnitude rather than a fraction of the path:
  // scaling by distance (e.g. half the path) makes activation ambiguous for
  // short drags, where half the path can land exactly on the threshold
  // instead of clearing it. Briefly overshooting past `to` on this first
  // move is harmless -- only the final reported position (after the loop
  // below) feeds the translated rect collision detection reads.
  const activationNudge = 8;

  fireEvent.pointerDown(element, {
    clientX: from.x,
    clientY: from.y,
    pointerId: 1,
  });
  fireEvent.pointerMove(document, {
    clientX: from.x + unit.x * activationNudge,
    clientY: from.y + unit.y * activationNudge,
    pointerId: 1,
  });
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    fireEvent.pointerMove(document, {
      clientX: from.x + dx * t,
      clientY: from.y + dy * t,
      pointerId: 1,
    });
  }
}

/**
 * Ends a drag started by `dragPointer` at the given coordinates.
 *
 * Async and must be awaited: PointerSensor's `detach()` (AbstractPointerSensor
 * in @dnd-kit/core) removes its document-level click/selection listeners via
 * `setTimeout(..., 50)`, deliberately deferred so the drop doesn't eat the
 * same click that ends it. Without waiting past that window, those listeners
 * (one has `capture: true` and calls stopPropagation on every click) are
 * still attached to `document` when a later test runs, and can silently
 * swallow that test's own unrelated clicks -- confirmed directly: an
 * unrelated, previously-passing test started failing only when it ran
 * immediately after a test using this helper, and passed again once this
 * wait was added.
 */
export async function dropPointer(at: { x: number; y: number }): Promise<void> {
  fireEvent.pointerUp(document, { clientX: at.x, clientY: at.y, pointerId: 1 });
  await new Promise(resolve => {
    setTimeout(resolve, 60);
  });
}
