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
import { render, screen, waitFor } from 'spec/helpers/testing-library';
import {
  mockElementRectsByText,
  verticalRect,
  dragPointer,
  dropPointer,
} from 'spec/helpers/dndTestUtils';
import {
  OptionControlLabel,
  DragContainer,
  OptionControlContainer,
  Label,
  CaretContainer,
  CloseContainer,
  HeaderContainer,
  LabelsContainer,
  DndLabelsContainer,
  AddControlLabel,
  AddIconButton,
} from 'src/explore/components/controls/OptionControls';

const defaultProps = {
  label: <span>Test label</span>,
  tooltipTitle: 'This is a tooltip title',
  onRemove: jest.fn(),
  onMoveLabel: jest.fn(),
  onDropLabel: jest.fn(),
  type: 'test',
  index: 0,
};

const setup = (overrides?: Record<string, any>) =>
  render(<OptionControlLabel {...defaultProps} {...overrides} />, {
    useDnd: true,
  });

test('should render', async () => {
  const { container } = setup();
  await waitFor(() => expect(container).toBeVisible());
});

test('should display a label', async () => {
  setup();
  expect(await screen.findByText('Test label')).toBeInTheDocument();
});

// Add at the top of the file, after imports
jest.setTimeout(20000);

test('should display a certification icon if saved metric is certified', async () => {
  const { container } = setup({
    savedMetric: {
      metric_name: 'test_metric',
      is_certified: true,
    },
  });

  await waitFor(
    () => {
      expect(screen.queryByText('Test label')).not.toBeInTheDocument();
    },
    { timeout: 10000 },
  );

  await waitFor(
    () => {
      const icon = container.querySelector('.metric-option > svg');
      expect(icon).toBeInTheDocument();
    },
    { timeout: 10000 },
  );
});

test('triggers onMoveLabel on drop', async () => {
  render(
    <>
      <OptionControlLabel
        {...defaultProps}
        index={1}
        label={<span>Label 1</span>}
      />
      <OptionControlLabel
        {...defaultProps}
        index={2}
        label={<span>Label 2</span>}
      />
      ,
    </>,
    { useDnd: true },
  );
  // Phase 8 migration (react-dnd -> @dnd-kit): see OptionWrapper.test.tsx's
  // "triggers onShiftOptions on drop" for why plain dragStart/drop (react-
  // dnd's HTML5Backend-era native event simulation) can't drive @dnd-kit's
  // PointerSensor, and why dragPointer's stacked rects + interpolated steps
  // are both needed for OptionControlLabel's own onDragMove-based reorder
  // check to resolve `over` to Label 2.
  const restoreRects = mockElementRectsByText({
    'Label 1': verticalRect(0, 20),
    'Label 2': verticalRect(20, 20),
  });
  try {
    const label1 = screen.getByText('Label 1');
    dragPointer(label1, { x: 10, y: 10 }, { x: 10, y: 30 });
    await dropPointer({ x: 10, y: 30 });
    await waitFor(() => expect(defaultProps.onMoveLabel).toHaveBeenCalled());
  } finally {
    restoreRects.mockRestore();
  }
});

test('renders DragContainer', () => {
  const { container } = render(<DragContainer />);
  expect(container).toBeInTheDocument();
});

test('renders OptionControlContainer', () => {
  const { container } = render(<OptionControlContainer />);
  expect(container).toBeInTheDocument();
});

test('renders Label', () => {
  const { container } = render(<Label />);
  expect(container).toBeInTheDocument();
});

test('renders CaretContainer', () => {
  const { container } = render(<CaretContainer />);
  expect(container).toBeInTheDocument();
});

test('renders CloseContainer', () => {
  const { container } = render(<CloseContainer />);
  expect(container).toBeInTheDocument();
});

test('renders HeaderContainer', () => {
  const { container } = render(<HeaderContainer />);
  expect(container).toBeInTheDocument();
});

test('renders LabelsContainer', () => {
  const { container } = render(<LabelsContainer />);
  expect(container).toBeInTheDocument();
});

test('renders DndLabelsContainer', () => {
  const { container } = render(<DndLabelsContainer />);
  expect(container).toBeInTheDocument();
});

test('renders AddControlLabel', () => {
  const { container } = render(<AddControlLabel />);
  expect(container).toBeInTheDocument();
});

test('renders AddIconButton', () => {
  const { container } = render(<AddIconButton />);
  expect(container).toBeInTheDocument();
});
