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
import { createContext, Dispatch, FC, useReducer } from 'react';

import { styled } from '@apache-superset/core/theme';
import { useDndContext } from '@dnd-kit/core';
import { DatasourcePanelDndItem } from '../DatasourcePanel/types';

type CanDropValidator = (item: DatasourcePanelDndItem) => boolean;
type DropzoneSet = Record<string, CanDropValidator>;
type Action = { key: string; canDrop?: CanDropValidator };

export const DraggingContext = createContext(false);
export const DropzoneContext = createContext<[DropzoneSet, Dispatch<Action>]>([
  {},
  () => {},
]);
const StyledDiv = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
`;

const reducer = (state: DropzoneSet = {}, action: Action) => {
  if (action.canDrop) {
    return {
      ...state,
      [action.key]: action.canDrop,
    };
  }
  if (action.key) {
    const newState = { ...state };
    delete newState[action.key];
    return newState;
  }
  return state;
};

const ExploreContainer: FC<{}> = ({ children }) => {
  // Phase 8 migration (react-dnd -> @dnd-kit). useDndContext() is a plain
  // context consumer -- it re-renders this component on every active-drag
  // change on its own, no manual subscribeToStateChange plumbing needed the
  // way react-dnd's monitor required.
  const { active } = useDndContext();
  // don't show dragging state for the sorting item
  const dragging = active !== null && !('dragIndex' in (active.data.current ?? {}));

  const dropzoneValue = useReducer(reducer, {});

  return (
    <DropzoneContext.Provider value={dropzoneValue}>
      <DraggingContext.Provider value={dragging}>
        <StyledDiv>{children}</StyledDiv>
      </DraggingContext.Provider>
    </DropzoneContext.Provider>
  );
};

export default ExploreContainer;
