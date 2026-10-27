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

import JSDOMEnvironment from 'jest-environment-jsdom';

// https://github.com/facebook/jest/blob/v29.4.3/website/versioned_docs/version-29.4/Configuration.md#testenvironment-string
export default class FixJSDOMEnvironment extends JSDOMEnvironment {
  constructor(...args: ConstructorParameters<typeof JSDOMEnvironment>) {
    super(...args);

    // FIXME https://github.com/jsdom/jsdom/issues/1724
    this.global.fetch = fetch;
    this.global.Headers = Headers;
    this.global.Request = Request;
    this.global.Response = Response;
    this.global.AbortSignal = AbortSignal;
    this.global.AbortController = AbortController;
    this.global.ReadableStream = ReadableStream;

    // Mock MessageChannel to prevent hanging Jest tests with rc-overflow@1.4.1
    // Forces rc-overflow to use requestAnimationFrame fallback instead
    // Can be removed when rc-overflow properly cleans up MessagePorts in test environments
    // See: https://github.com/apache/superset/pull/34871
    this.global.MessageChannel = undefined as any;
    this.global.MessagePort = undefined as any;

    // jsdom has no PointerEvent class at all (confirmed:
    // `typeof PointerEvent === 'undefined'` here) -- @dnd-kit's sensors
    // require real PointerEvent instances, so fireEvent.pointerDown/Move/Up
    // in tests are otherwise invisible to them. Minimal spec-shaped
    // polyfill on top of the MouseEvent this environment already has.
    // Added for the Phase 8 (react-dnd -> @dnd-kit) migration -- see
    // DashboardWrapper.test.tsx and Tab.test.tsx.
    if (typeof this.global.PointerEvent === 'undefined') {
      class PointerEvent extends this.global.MouseEvent {
        public pointerId: number;

        public pointerType: string;

        public isPrimary: boolean;

        public width: number;

        public height: number;

        public pressure: number;

        public tangentialPressure: number;

        public tiltX: number;

        public tiltY: number;

        public twist: number;

        constructor(type: string, params: PointerEventInit = {}) {
          super(type, params);
          this.pointerId = params.pointerId ?? 0;
          this.pointerType = params.pointerType ?? 'mouse';
          this.isPrimary = params.isPrimary ?? true;
          this.width = params.width ?? 1;
          this.height = params.height ?? 1;
          this.pressure = params.pressure ?? 0;
          this.tangentialPressure = params.tangentialPressure ?? 0;
          this.tiltX = params.tiltX ?? 0;
          this.tiltY = params.tiltY ?? 0;
          this.twist = params.twist ?? 0;
        }
      }
      this.global.PointerEvent = PointerEvent as any;
    }

    // jsdom does not implement Document.elementsFromPoint either --
    // dragDroppableRegistry.ts's hitTestDragDroppables() already guards for
    // its absence (`typeof document.elementsFromPoint !== 'function'`) and
    // falls back to `[]`, but that guard is what keeps the real @dnd-kit
    // hit-testing code path from ever running under test. Polyfilled here
    // as a real (if layout-less) function -- jsdom has no layout engine, so
    // it can't compute true hit elements, but it must exist and be callable
    // so the code path under test matches production and individual tests
    // can mock its return value (document.elementsFromPoint = jest.fn...)
    // to simulate a real hit-test result.
    if (typeof this.global.document.elementsFromPoint !== 'function') {
      this.global.document.elementsFromPoint = () => [];
    }
  }
}
