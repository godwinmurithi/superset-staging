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
import {
  mockElementRectsByText,
  verticalRect,
  dragPointer,
  dropPointer,
} from 'spec/helpers/dndTestUtils';
import { DndItemType } from 'src/explore/components/DndItemType';
import OptionWrapper from 'src/explore/components/controls/DndColumnSelectControl/OptionWrapper';

test('renders with default props', async () => {
  const { container } = render(
    <OptionWrapper
      index={1}
      clickClose={jest.fn()}
      type={'Column' as DndItemType}
      onShiftOptions={jest.fn()}
      label="Option"
    />,
    { useDnd: true },
  );
  expect(container).toBeInTheDocument();
  expect(await screen.findByRole('img', { name: 'close' })).toBeInTheDocument();
});

test('triggers onShiftOptions on drop', async () => {
  const onShiftOptions = jest.fn();
  render(
    <>
      <OptionWrapper
        index={1}
        clickClose={jest.fn()}
        type={'Column' as DndItemType}
        onShiftOptions={onShiftOptions}
        label="Option 1"
      />
      <OptionWrapper
        index={2}
        clickClose={jest.fn()}
        type={'Column' as DndItemType}
        onShiftOptions={onShiftOptions}
        label="Option 2"
      />
    </>,
    { useDnd: true },
  );

  // Phase 8 migration (react-dnd -> @dnd-kit): OptionWrapper's reorder logic
  // runs off useDndMonitor's onDragMove, which only fires for real @dnd-kit
  // drags -- fireEvent.dragStart/drop (react-dnd's HTML5Backend-era native
  // event simulation) is invisible to @dnd-kit's PointerSensor. Stacked
  // rects let rectIntersection (the DndContext default collision detector)
  // resolve `event.over` to Option 2 once the drag crosses into its rect;
  // dragPointer's interpolated steps are what let `over` actually settle
  // there before onDragMove reads it (see its own comment for why).
  const restoreRects = mockElementRectsByText({
    'Option 1': verticalRect(0, 20),
    'Option 2': verticalRect(20, 20),
  });
  try {
    const option1 = await screen.findByText('Option 1');
    dragPointer(option1, { x: 10, y: 10 }, { x: 10, y: 30 });
    await dropPointer({ x: 10, y: 30 });
    expect(onShiftOptions).toHaveBeenCalledWith(1, 2);
  } finally {
    restoreRects.mockRestore();
  }
});
