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
import type { DragItem } from './dragDroppableConfig';

/**
 * Phase 8 migration (react-dnd -> @dnd-kit). `getDropPosition.ts`,
 * `handleHover.ts` and `handleDrop.ts` only ever called two methods on
 * react-dnd's `DropTargetMonitor`: `getItem()` and `getClientOffset()` --
 * confirmed by reading every call site before writing this, not assumed.
 * That means those three files can be reused completely unchanged (the
 * actual hit-testing/positioning math they contain has nothing react-dnd-
 * specific in it) as long as something implementing just these two methods
 * is passed in. This is that something.
 */
export interface MonitorShim {
  getItem: () => DragItem | null;
  getClientOffset: () => { x: number; y: number } | null;
}

export function createMonitorShim(
  getItem: () => DragItem | null,
  getClientOffset: () => { x: number; y: number } | null,
): MonitorShim {
  return { getItem, getClientOffset };
}
