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
import { Slice } from 'src/dashboard/types';
import { useDndKitPointer } from './DndKitProvider';
import AddSliceCard from '../AddSliceCard';
import {
  NEW_COMPONENT_SOURCE_TYPE,
  CHART_TYPE,
} from '../../util/componentTypes';

interface AddSliceDragPreviewProps {
  slices: Slice[] | null;
}

const staticCardStyles: React.CSSProperties = {
  position: 'fixed',
  pointerEvents: 'none',
  top: 0,
  left: 0,
  zIndex: 101, // this should be higher than top-level tabs
  width: 376 - 2 * 16,
};

/**
 * Phase 8 migration (react-dnd -> @dnd-kit). Was react-dnd's `DragLayer`
 * HOC -- replaced with a direct `useDndKitPointer()` read, which gives the
 * same three pieces (dragging item, current offset, isDragging) reactively
 * with no HOC needed. `SliceAdder.tsx` deliberately does NOT apply
 * `dragHandleStyle`'s CSS transform to its own list item (see that file's
 * own comment) specifically so this floating card is the only thing that
 * visibly moves -- unchanged from the original "useEmptyDragPreview" intent
 * that motivated this component in the first place (a custom preview was
 * needed because the real list item lives inside a fixed-position,
 * virtualized container where a moving native ghost looked broken).
 */
const AddSliceDragPreview: React.FC<AddSliceDragPreviewProps> = ({
  slices,
}) => {
  const { draggingItem, clientOffset } = useDndKitPointer();

  if (!clientOffset || !draggingItem || !slices) return null;

  const slice = slices[draggingItem.index];

  // make sure it's a new component and a chart
  const shouldRender =
    slice &&
    draggingItem.parentType === NEW_COMPONENT_SOURCE_TYPE &&
    draggingItem.type === CHART_TYPE;

  return !shouldRender ? null : (
    <AddSliceCard
      style={{
        ...staticCardStyles,
        transform: `translate(${clientOffset.x}px, ${clientOffset.y}px)`,
      }}
      sliceName={slice.slice_name}
      lastModified={slice.changed_on_humanized}
      visType={slice.viz_type}
      datasourceUrl={slice.datasource_url}
      datasourceName={slice.datasource_name}
    />
  );
};

export default AddSliceDragPreview;
