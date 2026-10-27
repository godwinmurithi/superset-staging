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

import { render, screen } from 'spec/helpers/testing-library';

import DndKitProvider from 'src/dashboard/components/dnd/DndKitProvider';
import DraggableNewComponent from 'src/dashboard/components/gridComponents/new/DraggableNewComponent';
import { CHART_TYPE } from 'src/dashboard/util/componentTypes';

// TODO: rewrite to rtl
// eslint-disable-next-line no-restricted-globals -- TODO: Migrate from describe blocks
describe('DraggableNewComponent', () => {
  const props = {
    id: 'id',
    type: CHART_TYPE,
    label: 'label!',
    className: 'a_class',
  };

  function setup(overrideProps: Record<string, unknown> = {}) {
    return render(
      <DndKitProvider>
        <DraggableNewComponent {...props} {...overrideProps} />
      </DndKitProvider>,
    );
  }

  beforeEach(() => {
    setup();
  });

  test('should render a DragDroppable', () => {
    expect(screen.getByTestId('dragdroppable-object')).toBeInTheDocument();
  });

  test('should pass component={ type, id } to DragDroppable', () => {
    const dragComponent = screen.getByTestId('dragdroppable-object');
    expect(dragComponent).toHaveClass(
      'dragdroppable dragdroppable--edit-mode dragdroppable-row',
    );
  });

  test('should pass appropriate parent source and id to DragDroppable', () => {
    // Phase 8 migration (react-dnd -> @dnd-kit): the old assertion checked
    // for the native HTML5 `draggable="true"` attribute, which was specific
    // to react-dnd's HTML5Backend. @dnd-kit is pointer-event based and never
    // sets it; `aria-roledescription="draggable"` (from useDraggable's own
    // `attributes`, verified against the real rendered DOM) is the accurate
    // signal that this element is now a drag source.
    const dragComponent = screen.getByTestId('new-component');
    expect(dragComponent).toHaveAttribute('aria-roledescription', 'draggable');
  });

  test('should render the passed label', () => {
    expect(screen.getByText(props.label)).toBeInTheDocument();
  });

  test('should add the passed className', () => {
    const component = screen
      .getByTestId('new-component')
      .querySelector('.new-component-placeholder');
    expect(component).toHaveClass(
      `new-component-placeholder ${props.className}`,
    );
  });
});
