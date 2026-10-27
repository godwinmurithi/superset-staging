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
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from '@dnd-kit/core';
import { LayoutItem, ComponentType } from 'src/dashboard/types';

// Phase 8 migration (react-dnd -> @dnd-kit). `dragConfig`/`dropConfig` (the
// react-dnd DragSource/DropTarget HOC option tuples) are gone -- that logic
// now lives in `useDndKitDragDroppable.ts` (drag source, via @dnd-kit's
// `useDraggable`) and centrally in `DndKitProvider.tsx` (drop targets, via
// manual hit-testing -- see that file's docstring for why). What's left
// here are the plain type contracts every other file in this directory,
// and several files outside it, still import.
//
// A "type" concept doesn't exist for @dnd-kit the way react-dnd used it
// (react-dnd's own comment on the removed `TYPE` constant already said the
// type hook wasn't useful here, since dropping is contingent on other
// properties) -- `component.id` is already a unique per-instance id, which
// is what @dnd-kit's `useDraggable({ id })` needs.

export interface DragDroppableProps {
  component: LayoutItem;
  parentComponent?: LayoutItem;
  index: number;
  depth: number;
  disableDragDrop: boolean;
  orientation?: 'row' | 'column';
  isDraggingOverShallow?: boolean;
  onDrop?: (dropResult: DropResult) => void;
  onHover?: () => void;
  dropToChild?: boolean | ((draggingItem: DragItem) => boolean);
}

export interface DragItem {
  type: ComponentType;
  id: string;
  meta: LayoutItem['meta'];
  index: number;
  parentId?: string;
  parentType?: ComponentType;
}

export interface DropResult {
  source: {
    id: string;
    type: ComponentType;
    index: number;
  };
  dragging: {
    id: string;
    type: ComponentType;
    meta: LayoutItem['meta'];
  };
  destination?: {
    id: string;
    type: ComponentType;
    index: number;
  };
  position?: string;
}

export interface DragStateProps {
  dragSourceRef: (node: HTMLElement | null) => void;
  // Spread onto the same node as `dragSourceRef` so @dnd-kit's pointer/
  // keyboard activation actually fires from it (react-dnd's `connect.
  // dragSource()` was a single ref callback that did double duty as both
  // "measure this node" and "listen for drag-start on this node" -- @dnd-kit
  // splits those into a ref and a props-to-spread pair).
  dragHandleAttributes: DraggableAttributes;
  dragHandleListeners: DraggableSyntheticListeners;
  isDragging: boolean;
  dragComponentType?: ComponentType;
  dragComponentId?: string;
}

export interface DropStateProps {
  droppableRef: (node: HTMLElement | null) => void;
  isDraggingOver: boolean;
  isDraggingOverShallow: boolean;
}

export interface DragDroppableComponent {
  mounted: boolean;
  ref?: HTMLElement | null;
  props: DragDroppableProps;
  setState: (stateUpdate: () => { dropIndicator: string | null }) => void;
}
