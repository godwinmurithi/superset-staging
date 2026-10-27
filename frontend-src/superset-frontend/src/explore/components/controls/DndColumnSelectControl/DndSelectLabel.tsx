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
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react';
import { useDroppable, useDndMonitor, useDndContext } from '@dnd-kit/core';
import { useUniqueId } from '@dnd-kit/utilities';
import { t } from '@apache-superset/core/translation';
import ControlHeader from 'src/explore/components/ControlHeader';
import {
  AddControlLabel,
  DndLabelsContainer,
  HeaderContainer,
} from 'src/explore/components/controls/OptionControls';
import {
  DatasourcePanelDndItem,
  DndItemValue,
} from 'src/explore/components/DatasourcePanel/types';
import { Icons } from '@superset-ui/core/components/Icons';
import { DndItemType } from '../../DndItemType';
import { DraggingContext, DropzoneContext } from '../../ExploreContainer';

export type DndSelectLabelProps = {
  name: string;
  accept: DndItemType | DndItemType[];
  ghostButtonText: string;
  onDrop: (item: DatasourcePanelDndItem) => void;
  canDrop: (item: DatasourcePanelDndItem) => boolean;
  canDropValue?: (value: DndItemValue) => boolean;
  onDropValue?: (value: DndItemValue) => void;
  valuesRenderer: () => ReactNode;
  displayGhostButton?: boolean;
  onClickGhostButton: () => void;
  isLoading?: boolean;
};

export default function DndSelectLabel({
  displayGhostButton = true,
  accept,
  valuesRenderer,
  isLoading,
  ...props
}: DndSelectLabelProps) {
  const canDropProp = props.canDrop;
  const canDropValueProp = props.canDropValue;

  const dropValidator = useCallback(
    (item: DatasourcePanelDndItem) =>
      canDropProp(item) && (canDropValueProp?.(item.value) ?? true),
    [canDropProp, canDropValueProp],
  );

  // Phase 8 migration (react-dnd -> @dnd-kit). @dnd-kit's useDroppable has
  // no built-in "accept type" filtering the way react-dnd's `accept` option
  // did -- acceptedTypes/canDrop are checked by hand below, against
  // whatever is currently active on the shared DndContext (the same one
  // DndKitProvider mounts at the app root; Explore doesn't need its own).
  const acceptedTypes = isLoading ? [] : [accept].flat();
  // useId() is React 18-only (this codebase pins react@17, see CLAUDE.md);
  // @dnd-kit/utilities' useUniqueId gives the same per-instance uniqueness
  // for this purely client-side droppable id.
  const uniqueId = useUniqueId('dnd-select-label');
  const { setNodeRef: datasourcePanelDrop, isOver: isOverRaw } = useDroppable({
    id: uniqueId,
  });

  const { active } = useDndContext();
  const activeItem = active?.data.current as DatasourcePanelDndItem | undefined;
  const typeMatches = !!activeItem && acceptedTypes.includes(activeItem.type);
  const canDrop = typeMatches && !!activeItem && dropValidator(activeItem);
  const isOver = isOverRaw && typeMatches;

  useDndMonitor({
    onDragEnd: event => {
      if (event.over?.id !== uniqueId) return;
      const item = event.active.data.current as DatasourcePanelDndItem | undefined;
      if (!item || !acceptedTypes.includes(item.type) || !dropValidator(item)) {
        return;
      }
      props.onDrop(item);
      props.onDropValue?.(item.value);
    },
  });

  const dispatch = useContext(DropzoneContext)[1];

  useEffect(() => {
    dispatch({ key: props.name, canDrop: dropValidator });
    return () => {
      dispatch({ key: props.name });
    };
  }, [dispatch, props.name, dropValidator]);

  const isDragging = useContext(DraggingContext);

  const values = useMemo(() => valuesRenderer(), [valuesRenderer]);

  function renderGhostButton() {
    return (
      <AddControlLabel
        cancelHover={!props.onClickGhostButton}
        onClick={props.onClickGhostButton}
      >
        <Icons.PlusOutlined iconSize="m" />
        {t(props.ghostButtonText)}
      </AddControlLabel>
    );
  }

  return (
    <div ref={datasourcePanelDrop}>
      <HeaderContainer>
        <ControlHeader {...props} />
      </HeaderContainer>
      <DndLabelsContainer
        data-test="dnd-labels-container"
        canDrop={canDrop}
        isOver={isOver}
        isDragging={isDragging}
        isLoading={isLoading}
      >
        {values}
        {displayGhostButton && renderGhostButton()}
      </DndLabelsContainer>
    </div>
  );
}
