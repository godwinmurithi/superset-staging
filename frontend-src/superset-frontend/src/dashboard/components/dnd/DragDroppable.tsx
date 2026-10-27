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
  CSSProperties,
  PureComponent,
  ReactNode,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { useDraggable } from '@dnd-kit/core';
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { TAB_TYPE } from 'src/dashboard/util/componentTypes';
import cx from 'classnames';
import { css, styled } from '@apache-superset/core/theme';

import type { DragDroppableProps as BaseDragDroppableProps } from './dragDroppableConfig';
import type { DragDroppableComponent as DragDroppableComponentShape } from './dragDroppableConfig';
import { DROP_FORBIDDEN } from '../../util/getDropPosition';
import type { ComponentType } from '../../types';
import { useDndKitPointer } from './DndKitProvider';
import {
  registerDragDroppable,
  unregisterDragDroppable,
} from './dragDroppableRegistry';
import handleHover from './handleHover';
import { createMonitorShim } from './monitorShim';

interface DropIndicatorProps {
  className: string;
}

interface ChildProps {
  dragSourceRef?: (node: HTMLElement | null) => void;
  // Spread onto the same node as `dragSourceRef` -- see dragDroppableConfig's
  // module docstring for why @dnd-kit needs both a ref AND these, unlike
  // react-dnd's single `connect.dragSource()` callback.
  dragHandleAttributes?: DraggableAttributes;
  dragHandleListeners?: DraggableSyntheticListeners;
  // The "follows your cursor" CSS transform (see dragHandleStyle's own
  // comment on DragDroppableDndProps) -- spread as `style={dragHandleStyle}`
  // onto the same node as dragSourceRef.
  dragHandleStyle?: CSSProperties;
  dropIndicatorProps: DropIndicatorProps | null;
  draggingTabOnTab?: boolean;
  'data-test': string;
}

interface DragDroppableOwnProps extends BaseDragDroppableProps {
  children: (childProps: ChildProps) => ReactNode;
  className?: string | null;
  style?: CSSProperties | null;
  onDropIndicatorChange?: (info: {
    dropIndicator: string | null;
    isDraggingOver: boolean;
    index: number;
  }) => void;
  onDragTab?: (dragComponentId: string | undefined) => void;
  editMode?: boolean;
  useEmptyDragPreview?: boolean;
}

interface DragDroppableDndProps {
  isDragging: boolean;
  dragSourceRef: (node: HTMLElement | null) => void;
  dragHandleAttributes: DraggableAttributes;
  dragHandleListeners: DraggableSyntheticListeners;
  dragPreviewRef: (node: HTMLElement | null) => void;
  /**
   * react-dnd's HTML5 backend moved a native browser drag-ghost-image with
   * the cursor for free; @dnd-kit has no native drag image at all. This is
   * the CSS `transform` string that reproduces "the card follows your
   * cursor" -- passed through to children as `dragHandleStyle` (ChildProps)
   * since it must be applied to the SAME node dragSourceRef/dragHandle*
   * attach to, which varies per consumer (see ChildProps' own comment).
   */
  dragHandleStyle: CSSProperties | undefined;
  /**
   * False for the drag-only `Draggable` export (old react-dnd behaviour:
   * `DragSource(...)` alone injected no drop-target props at all). Without
   * this, every drag-only leaf (a chart's own content, a header, ...) would
   * register as a hit-testable drop target too, and being visually
   * innermost under the pointer, would wrongly win "shallowest" over the
   * actual intended Row/Column/Tab drop target one level up.
   */
  registerAsDropTarget: boolean;
  /**
   * Raw pointer/hit-stack state from DndKitProvider. isDraggingOver,
   * isDraggingOverShallow, dragComponentType and dragComponentId (all
   * props on the old react-dnd-injected DragDroppableDndProps) are derived
   * from this INSIDE the class below, by checking whether `this` appears
   * in dndPointer.hitStack -- see registerDragDroppable/componentDidMount.
   */
  dndPointer: {
    draggingItem: { type: ComponentType; id: string } | null;
    clientOffset: { x: number; y: number } | null;
    hitStack: DragDroppableComponentShape[];
  };
}

type DragDroppableAllProps = DragDroppableOwnProps & DragDroppableDndProps;

interface DragDroppableState {
  dropIndicator: string | null;
}

const DragDroppableStyles = styled.div`
  ${({ theme }) => css`
    position: relative;

    &.dragdroppable--dragging {
      opacity: 0.2;
    }

    &.dragdroppable-row {
      width: 100%;
    }
    /* workaround to avoid a bug in react-dnd where the drag
      preview expands outside of the bounds of the drag source card, see:
      https://github.com/react-dnd/react-dnd/issues/832 */
    &.dragdroppable-column {
      /* for chrome */
      transform: translate3d(0, 0, 0);
      /* for safari */
      backface-visibility: hidden;
    }

    &.dragdroppable-column .resizable-container span div {
      z-index: 10;
    }

    & {
      .drop-indicator {
        display: block;
        background-color: ${theme.colorPrimary};
        position: absolute;
        z-index: 10;
        opacity: 0.3;
        width: 100%;
        height: 100%;
        &.drop-indicator--forbidden {
          background-color: ${theme.colorErrorBg};
        }
      }
    }
  `};
`;
// export unwrapped component for testing
export class UnwrappedDragDroppable extends PureComponent<
  DragDroppableAllProps,
  DragDroppableState
> {
  mounted: boolean;

  ref: HTMLDivElement | null;

  static defaultProps = {
    className: null,
    style: null,
    parentComponent: undefined,
    disableDragDrop: false,
    dropToChild: false,
    children() {},
    onDrop() {},
    onHover() {},
    onDropIndicatorChange() {},
    onDragTab() {},
    orientation: 'row' as const,
    useEmptyDragPreview: false,
    isDragging: false,
    dragSourceRef() {},
    dragHandleAttributes: {},
    dragHandleListeners: undefined,
    dragPreviewRef() {},
    dragHandleStyle: undefined,
    dndPointer: { draggingItem: null, clientOffset: null, hitStack: [] },
    registerAsDropTarget: true,
  };

  constructor(props: DragDroppableAllProps) {
    super(props);
    this.state = {
      dropIndicator: null, // set/modified below, from the shared pointer/hit-stack state
    };
    this.mounted = false;
    this.ref = null;
    this.setRef = this.setRef.bind(this);
  }

  componentDidMount(): void {
    this.mounted = true;
    // See dragDroppableRegistry.ts's docstring: registering `this` here
    // (rather than in setRef, which can fire before a parent's own ref-to-
    // this-instance would be ready) is what lets DndKitProvider's centralized
    // hit-test dispatch call handleDrop directly on the correct, live
    // component instance. Skipped for drag-only instances -- see
    // registerAsDropTarget's own comment above.
    if (this.ref && this.props.registerAsDropTarget) {
      registerDragDroppable(this.ref, this);
    }
  }

  componentWillUnmount(): void {
    this.mounted = false;
    if (this.ref && this.props.registerAsDropTarget) {
      unregisterDragDroppable(this.ref);
    }
  }

  isDraggingOver(): boolean {
    return this.props.dndPointer.hitStack.some(entry => entry === this);
  }

  isDraggingOverShallow(): boolean {
    return this.props.dndPointer.hitStack[0] === this;
  }

  componentDidUpdate(
    prevProps: DragDroppableAllProps,
    prevState: DragDroppableState,
  ): void {
    const {
      onDropIndicatorChange,
      component,
      index,
      onDragTab,
      dndPointer,
    } = this.props;
    const isDraggingOver = this.isDraggingOver();
    const wasDraggingOver = prevProps.dndPointer.hitStack.some(
      entry => entry === this,
    );

    // Mirrors react-dnd's own behaviour: every nested target the pointer is
    // currently over gets a hover callback, not just the innermost one --
    // see DndKitProvider.tsx's module docstring for why that's the whole
    // reason this isn't done via @dnd-kit's own useDroppable/collision
    // detection.
    if (dndPointer.draggingItem && isDraggingOver && this.mounted) {
      const monitor = createMonitorShim(
        () => dndPointer.draggingItem,
        () => dndPointer.clientOffset,
      );
      handleHover(
        { ...this.props, isDraggingOverShallow: this.isDraggingOverShallow() },
        monitor,
        this,
      );
    } else if (wasDraggingOver && !isDraggingOver) {
      // No longer under the pointer -- clear the indicator rather than
      // leaving it stale until the next drop/cancel.
      this.setState(() => ({ dropIndicator: null }));
    }

    const { dropIndicator } = this.state;
    const isTabsType = component.type === TAB_TYPE;
    const validStateChange =
      dropIndicator !== prevState.dropIndicator ||
      isDraggingOver !== wasDraggingOver ||
      index !== prevProps.index;

    if (onDropIndicatorChange && isTabsType && validStateChange) {
      onDropIndicatorChange({ dropIndicator, isDraggingOver, index });
    }

    const dragComponentId = dndPointer.draggingItem?.id;
    if (dragComponentId !== prevProps.dndPointer.draggingItem?.id) {
      setTimeout(() => {
        /**
         * This timeout ensures the dragSourceRef and dragPreviewRef are set
         * before the component is removed in Tabs.jsx. Otherwise the drag
         * preview would not render correctly.
         */
        onDragTab?.(dragComponentId);
      });
    }
  }

  setRef(ref: HTMLDivElement | null): void {
    this.ref = ref;
    this.props.dragPreviewRef(ref);
  }

  render(): ReactNode {
    const {
      children,
      className,
      orientation,
      dragSourceRef,
      dragHandleAttributes,
      dragHandleListeners,
      dragHandleStyle,
      disableDragDrop,
      isDragging,
      style,
      editMode,
      component,
      dndPointer,
    } = this.props;

    const isDraggingOver = this.isDraggingOver();
    const dragComponentType = dndPointer.draggingItem?.type;

    const { dropIndicator } = this.state;
    const dropIndicatorProps: DropIndicatorProps | null =
      isDraggingOver && dropIndicator && !disableDragDrop
        ? {
            className: cx(
              'drop-indicator',
              dropIndicator === DROP_FORBIDDEN && 'drop-indicator--forbidden',
            ),
          }
        : null;

    const draggingTabOnTab =
      component.type === TAB_TYPE && dragComponentType === TAB_TYPE;

    const childProps: ChildProps = editMode
      ? {
          dragSourceRef,
          dragHandleAttributes,
          dragHandleListeners,
          dragHandleStyle,
          dropIndicatorProps,
          draggingTabOnTab,
          'data-test': 'dragdroppable-content',
        }
      : {
          dropIndicatorProps: null,
          'data-test': 'dragdroppable-content',
        };

    return (
      <DragDroppableStyles
        style={style ?? undefined}
        ref={this.setRef}
        data-test="dragdroppable-object"
        className={cx(
          'dragdroppable',
          editMode && 'dragdroppable--edit-mode',
          orientation === 'row' && 'dragdroppable-row',
          orientation === 'column' && 'dragdroppable-column',
          isDragging && 'dragdroppable--dragging',
          className,
        )}
      >
        {children(childProps)}
      </DragDroppableStyles>
    );
  }
}

export type DragDroppableWrapperProps = DragDroppableOwnProps;

/**
 * Phase 8 migration. react-dnd's `DragSource(...)`/`DropTarget(...)` HOCs
 * are replaced with this single functional wrapper: it calls @dnd-kit's
 * `useDraggable` (the drag SOURCE half -- pointer/keyboard activation,
 * `setNodeRef` for rect measurement) and subscribes to the shared pointer
 * store from `DndKitProvider` (the drop TARGET half, resolved centrally --
 * see that file's docstring), then feeds both into
 * `UnwrappedDragDroppable` as plain props, unchanged from what that class
 * already expected.
 *
 * `dragSource`/`dropTarget` mirror the three old exports' capabilities:
 * `Draggable` = dragSource only, `Droppable` = dropTarget only,
 * `DragDroppable` = both -- the two flags are independent, matching the
 * original three distinct HOC compositions exactly.
 */
function useDragDroppableWiring(
  props: DragDroppableWrapperProps,
  { dragSource, dropTarget }: { dragSource: boolean; dropTarget: boolean },
) {
  const { component, index, parentComponent, disableDragDrop } = props;

  const dragItem = useMemo(
    () => ({
      type: component.type,
      id: component.id,
      meta: component.meta,
      index,
      parentId: parentComponent?.id,
      parentType: parentComponent?.type,
    }),
    [component, index, parentComponent],
  );

  const draggable = useDraggable({
    id: component.id,
    data: dragItem,
    disabled: !dragSource || disableDragDrop,
  });

  const dndPointer = useDndKitPointer();

  const dragSourceRef = useCallback(
    (node: HTMLElement | null) => {
      if (dragSource) draggable.setNodeRef(node);
    },
    [dragSource, draggable.setNodeRef],
  );

  const dragPreviewRefTarget = useRef<HTMLElement | null>(null);
  const dragPreviewRef = useCallback((node: HTMLElement | null) => {
    dragPreviewRefTarget.current = node;
  }, []);

  // See dragHandleStyle's own comment (DragDroppableDndProps): @dnd-kit has
  // no native drag-image, so the "follows your cursor" affordance has to be
  // applied by hand, onto whichever node dragSourceRef/dragHandle* land on.
  const dragHandleStyle = useMemo<CSSProperties | undefined>(
    () =>
      dragSource && draggable.transform
        ? { transform: CSS.Translate.toString(draggable.transform) }
        : undefined,
    [dragSource, draggable.transform],
  );

  return {
    isDragging: dragSource ? draggable.isDragging : false,
    dragSourceRef,
    dragHandleAttributes: dragSource ? draggable.attributes : {},
    dragHandleListeners: dragSource ? draggable.listeners : undefined,
    dragHandleStyle,
    dragPreviewRef,
    dndPointer,
    registerAsDropTarget: dropTarget,
  };
}

function DragOnly(props: DragDroppableOwnProps) {
  const wiring = useDragDroppableWiring(props, {
    dragSource: true,
    dropTarget: false,
  });
  return <UnwrappedDragDroppable {...props} {...wiring} />;
}

function DropOnly(props: DragDroppableOwnProps) {
  const wiring = useDragDroppableWiring(props, {
    dragSource: false,
    dropTarget: true,
  });
  return <UnwrappedDragDroppable {...props} {...wiring} />;
}

function DragAndDrop(props: DragDroppableOwnProps) {
  const wiring = useDragDroppableWiring(props, {
    dragSource: true,
    dropTarget: true,
  });
  return <UnwrappedDragDroppable {...props} {...wiring} />;
}

export const Draggable = DragOnly;
export const Droppable = DropOnly;
export const DragDroppable = DragAndDrop;
