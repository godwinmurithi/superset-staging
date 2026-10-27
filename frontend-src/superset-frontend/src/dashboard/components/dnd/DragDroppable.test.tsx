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
import { render } from 'spec/helpers/testing-library';

import newComponentFactory from 'src/dashboard/util/newComponentFactory';
import {
  CHART_TYPE,
  ROW_TYPE,
  TAB_TYPE,
} from 'src/dashboard/util/componentTypes';
import { UnwrappedDragDroppable as DragDroppable } from 'src/dashboard/components/dnd/DragDroppable';
import { getDragDroppableAt } from 'src/dashboard/components/dnd/dragDroppableRegistry';

// Phase 8 migration (react-dnd -> @dnd-kit). isDraggingOver/
// isDraggingOverShallow are now DERIVED from `props.dndPointer.hitStack`
// (identity-checked against `this` -- see DragDroppable.tsx) rather than
// plain injected props, since that's what makes the real hover dispatch in
// DndKitProvider.tsx work. Overriding the two derivation methods directly
// on a subclass is the simplest way to simulate "this instance is currently
// a hover/drop target" without also having to fabricate a real hitStack
// entry referencing the not-yet-constructed instance.
class MockDragDroppable extends DragDroppable {
  isDraggingOver(): boolean {
    return true;
  }

  isDraggingOverShallow(): boolean {
    return true;
  }
}

// eslint-disable-next-line no-restricted-globals -- TODO: Migrate from describe blocks
describe('DragDroppable', () => {
  const props = {
    component: newComponentFactory(CHART_TYPE),
    parentComponent: newComponentFactory(ROW_TYPE),
    editMode: false,
    depth: 1,
    index: 0,
    disableDragDrop: false,
    isDragging: false,
    registerAsDropTarget: true,
    dndPointer: { draggingItem: null, clientOffset: null, hitStack: [] },
    dragSourceRef: (() => {}) as any,
    dragHandleAttributes: {},
    dragHandleListeners: undefined,
    dragPreviewRef: (() => {}) as any,
  };

  function setup(overrideProps: Record<string, any> = {}) {
    const defaultChildren = (provided: Record<string, unknown>) => (
      <div data-test="child-content" {...provided}>
        Test Content
      </div>
    );

    const allProps = { ...props, ...overrideProps } as any;

    const utils = render(
      <DragDroppable {...allProps}>
        {overrideProps.children || defaultChildren}
      </DragDroppable>,
    );
    return {
      ...utils,
      children: overrideProps.children || defaultChildren,
    };
  }

  test('should call its child function', () => {
    const renderChild = jest.fn((provided: Record<string, unknown>) => (
      <div data-test="child-content" {...provided}>
        Test Content
      </div>
    ));

    setup({ children: renderChild });
    expect(renderChild).toHaveBeenCalled();
    expect(renderChild.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        'data-test': 'dragdroppable-content',
      }),
    );
  });

  test('should call its child function with "dragSourceRef" if editMode=true', () => {
    const renderChild = jest.fn().mockImplementation(provided => (
      <div data-test="child-content" {...provided}>
        Test Content
      </div>
    ));
    const dragSourceRef = () => {};

    setup({ children: renderChild, editMode: false });
    expect(renderChild).toHaveBeenCalledWith(
      expect.objectContaining({
        'data-test': 'dragdroppable-content',
      }),
    );

    setup({ children: renderChild, editMode: true, dragSourceRef });
    expect(renderChild).toHaveBeenLastCalledWith(
      expect.objectContaining({
        'data-test': 'dragdroppable-content',
        dragSourceRef,
      }),
    );
  });

  test('should call its child function with "dropIndicatorProps" dependent on editMode and isDraggingOver', () => {
    const renderChild = jest.fn((provided: Record<string, unknown>) => (
      <div data-test="child-content" {...provided}>
        Test Content
      </div>
    ));

    // Create a mock component with the dropIndicator state already set
    class MockDropIndicator extends MockDragDroppable {
      constructor(mockProps: ConstructorParameters<typeof DragDroppable>[0]) {
        super(mockProps);
        this.state = { dropIndicator: 'DROP_TOP' as any };
      }
    }

    render(
      <MockDropIndicator
        {...(props as any)}
        editMode
        component={newComponentFactory(TAB_TYPE)}
      >
        {renderChild}
      </MockDropIndicator>,
    );

    // Verify the last render included dropIndicatorProps
    expect(
      renderChild.mock.calls[renderChild.mock.calls.length - 1][0],
    ).toMatchObject({
      'data-test': 'dragdroppable-content',
      dropIndicatorProps: { className: 'drop-indicator' },
    });
  });

  test('should call props.dragPreviewRef on mount and register as a drop target', () => {
    const dragPreviewRef = jest.fn();

    const { container } = setup({ dragPreviewRef, registerAsDropTarget: true });
    expect(dragPreviewRef).toHaveBeenCalledTimes(1);

    // Registration (dragDroppableRegistry.ts) replaces the old externally-
    // supplied `droppableRef` callback prop -- the instance registers
    // itself, keyed by its own outer DOM node, in componentDidMount.
    const node = container.querySelector(
      '[data-test="dragdroppable-object"]',
    ) as HTMLElement;
    expect(getDragDroppableAt(node)).toBeDefined();
  });

  test('does not register as a drop target when registerAsDropTarget is false', () => {
    const { container } = setup({ registerAsDropTarget: false });
    const node = container.querySelector(
      '[data-test="dragdroppable-object"]',
    ) as HTMLElement;
    expect(getDragDroppableAt(node)).toBeUndefined();
  });

  test('should handle forbidden drops correctly', () => {
    const renderChild = jest.fn((provided: Record<string, unknown>) => (
      <div data-test="child-content" {...provided}>
        Test Content
      </div>
    ));

    class MockForbiddenDrop extends MockDragDroppable {
      constructor(mockProps: ConstructorParameters<typeof DragDroppable>[0]) {
        super(mockProps);
        this.state = { dropIndicator: 'DROP_FORBIDDEN' };
      }
    }

    render(
      <MockForbiddenDrop
        {...(props as any)}
        editMode
        component={newComponentFactory(TAB_TYPE)}
      >
        {renderChild}
      </MockForbiddenDrop>,
    );

    expect(
      renderChild.mock.calls[renderChild.mock.calls.length - 1][0],
    ).toMatchObject({
      dropIndicatorProps: {
        className: expect.stringContaining('drop-indicator--forbidden'),
      },
    });
  });

  test('should handle orientation prop correctly', () => {
    const { container } = setup({ orientation: 'column' });
    expect(container.firstChild).toHaveClass('dragdroppable-column');

    const { container: container2 } = setup({ orientation: 'row' });
    expect(container2.firstChild).toHaveClass('dragdroppable-row');
  });

  test('should handle disabled drag and drop', () => {
    const renderChild = jest.fn((provided: Record<string, unknown>) => (
      <div data-test="child-content" {...provided}>
        Test Content
      </div>
    ));

    class MockDisabledDrop extends MockDragDroppable {
      constructor(mockProps: ConstructorParameters<typeof DragDroppable>[0]) {
        super(mockProps);
        this.state = { dropIndicator: 'DROP_TOP' as any };
      }
    }

    render(
      <MockDisabledDrop
        {...(props as any)}
        editMode
        disableDragDrop
        component={newComponentFactory(TAB_TYPE)}
      >
        {renderChild}
      </MockDisabledDrop>,
    );

    expect(
      renderChild.mock.calls[renderChild.mock.calls.length - 1][0],
    ).toMatchObject({
      'data-test': 'dragdroppable-content',
      dropIndicatorProps: null,
    });
  });

  // The old "empty drag preview" test (react-dnd's getEmptyImage(), used to
  // hide the native HTML5 drag ghost) no longer applies: @dnd-kit has no
  // native drag image at all, so there is nothing to hide. `useEmptyDragPreview`
  // is accepted as a prop for backwards compatibility with existing callers
  // but is a no-op now -- setRef() always just calls dragPreviewRef(ref).

  test('should call onDropIndicatorChange when appropriate', () => {
    const onDropIndicatorChange = jest.fn();
    const { rerender } = render(
      <MockDragDroppable
        {...(props as any)}
        component={newComponentFactory(TAB_TYPE)}
        onDropIndicatorChange={onDropIndicatorChange}
      >
        {(provided: Record<string, unknown>) => (
          <div data-test="child-content" {...provided}>
            Test Content
          </div>
        )}
      </MockDragDroppable>,
    );

    rerender(
      <MockDragDroppable
        {...(props as any)}
        component={newComponentFactory(TAB_TYPE)}
        onDropIndicatorChange={onDropIndicatorChange}
        editMode
      >
        {(provided: Record<string, unknown>) => (
          <div data-test="child-content" {...provided}>
            Test Content
          </div>
        )}
      </MockDragDroppable>,
    );

    expect(onDropIndicatorChange).toHaveBeenCalledWith(
      expect.objectContaining({
        isDraggingOver: true,
      }),
    );
  });
});
