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
import { useCallback, useRef } from 'react';
import {
  useDraggable,
  useDroppable,
  useDndMonitor,
  DragMoveEvent,
} from '@dnd-kit/core';
import { CSS, useCombinedRefs, useUniqueId } from '@dnd-kit/utilities';
import { DragContainer } from 'src/explore/components/controls/OptionControls';
import {
  OptionProps,
  OptionItemInterface,
} from 'src/explore/components/controls/DndColumnSelectControl/types';
import { Tooltip } from '@superset-ui/core/components';
import { StyledColumnOption } from 'src/explore/components/optionRenderers';
import { isAdhocColumn } from '@superset-ui/core';
import { styled } from '@apache-superset/core/theme';
import { ColumnMeta } from '@superset-ui/chart-controls';
import Option from './Option';

export const OptionLabel = styled.div`
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export default function OptionWrapper(
  props: OptionProps & {
    type: string;
    onShiftOptions: (dragIndex: number, hoverIndex: number) => void;
  },
) {
  const {
    index,
    label,
    tooltipTitle,
    column,
    type,
    onShiftOptions,
    clickClose,
    withCaret,
    isExtra,
    datasourceWarningMessage,
    canDelete = true,
    tooltipOverlay,
    multiValueWarningMessage,
    ...rest
  } = props;
  const ref = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  // Phase 8 migration (react-dnd -> @dnd-kit). A genuinely unique id per
  // mounted OptionWrapper, no prop threading needed -- several
  // DndColumnSelectControl instances can be on one Explore page at once
  // (e.g. "Group by" and "Metrics"), each starting its own list back at
  // index 0, so a plain `index` would collide between them. useId() is
  // React 18-only (this codebase pins react@17, see CLAUDE.md);
  // @dnd-kit/utilities' useUniqueId gives the same per-instance uniqueness
  // without needing React 18's SSR-safe id generation, which this purely
  // client-side use case never needed anyway.
  const uniqueId = useUniqueId('option-wrapper');

  const {
    attributes,
    listeners,
    setNodeRef: setDraggableRef,
    transform,
    isDragging,
  } = useDraggable({
    id: uniqueId,
    data: { type, dragIndex: index },
  });
  const { setNodeRef: setDroppableRef } = useDroppable({ id: uniqueId });

  // Not using @dnd-kit/sortable's SortableContext here: that needs the
  // parent list to own a stable `items` id array, and OptionWrapper is
  // rendered from 5 different parent files, each with its own list shape
  // -- reimplementing react-dnd's own hover-threshold math directly (same
  // math, unchanged) keeps this self-contained to this one file instead.
  useDndMonitor({
    onDragMove: (event: DragMoveEvent) => {
      if (event.over?.id !== uniqueId || !ref.current) return;
      const item = event.active.data.current as OptionItemInterface | undefined;
      if (!item) return;
      const { dragIndex } = item;
      const hoverIndex = index;

      // Don't replace items with themselves
      if (dragIndex === hoverIndex) return;

      // Determine rectangle on screen
      const hoverBoundingRect = ref.current.getBoundingClientRect();
      // Get vertical middle
      const hoverMiddleY =
        (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      // Determine mouse position
      const activeRect =
        event.active.rect.current.translated ?? event.active.rect.current.initial;
      const hoverClientY = activeRect
        ? activeRect.top + activeRect.height / 2 - hoverBoundingRect.top
        : 0;
      // Only perform the move when the mouse has crossed half of the items height
      // When dragging downwards, only move when the cursor is below 50%
      // When dragging upwards, only move when the cursor is above 50%
      // Dragging downwards
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
      // Dragging upwards
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;

      // Time to actually perform the action
      onShiftOptions(dragIndex, hoverIndex);
      // eslint-disable-next-line no-param-reassign
      item.dragIndex = hoverIndex;
    },
  });

  const shouldShowTooltip =
    (!isDragging && tooltipTitle && label && tooltipTitle !== label) ||
    (!isDragging &&
      labelRef &&
      labelRef.current &&
      labelRef.current.scrollWidth > labelRef.current.clientWidth) ||
    (!isDragging && tooltipOverlay);

  const LabelContent = () => {
    if (!shouldShowTooltip) {
      return <span>{label}</span>;
    }
    if (tooltipOverlay) {
      return (
        <Tooltip overlay={tooltipOverlay}>
          <span>{label}</span>
        </Tooltip>
      );
    }
    return (
      <Tooltip title={tooltipTitle || label}>
        <span>{label}</span>
      </Tooltip>
    );
  };

  const ColumnOption = () => {
    const transformedCol =
      column && isAdhocColumn(column)
        ? { verbose_name: column.label, expression: column.sqlExpression }
        : column;
    return (
      <StyledColumnOption
        column={transformedCol as ColumnMeta}
        labelRef={labelRef}
        showType
      />
    );
  };

  const Label = () => {
    if (label) {
      return (
        <OptionLabel ref={labelRef}>
          <LabelContent />
        </OptionLabel>
      );
    }
    if (column) {
      return (
        <OptionLabel>
          <ColumnOption />
        </OptionLabel>
      );
    }
    return null;
  };

  // useCombinedRefs only accepts callback-style refs (its own type signature:
  // `(...refs: ((node: T) => void)[])`), not the RefObject useRef() returns --
  // found the hard way (`TypeError: ref is not a function`, since it calls
  // each ref as a function internally). Wrapped as a stable callback.
  const setRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      ref.current = node;
    },
    [ref],
  );
  const setRefs = useCombinedRefs(setRootRef, setDraggableRef, setDroppableRef);
  const style = {
    transform: transform ? CSS.Translate.toString(transform) : undefined,
  };

  return (
    <DragContainer
      ref={setRefs}
      style={style}
      {...attributes}
      {...listeners}
      {...rest}
    >
      <Option
        index={index}
        clickClose={clickClose}
        withCaret={withCaret}
        isExtra={isExtra}
        datasourceWarningMessage={datasourceWarningMessage}
        canDelete={canDelete}
        multiValueWarningMessage={multiValueWarningMessage}
      >
        <Label />
      </Option>
    </DragContainer>
  );
}
