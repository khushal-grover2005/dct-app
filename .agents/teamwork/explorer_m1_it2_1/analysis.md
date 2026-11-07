# Milestone 1 Iteration 2 — Explorer Root Cause Analysis & Fix Strategy

## 1. Executive Summary

During Milestone 1 Iteration 1 Gate Review, Challenger 1 rejected the build due to a vulnerability in the Browser Capability Gate (`isFileSystemAccessSupported()` in `src/app/capabilities.ts` and `<BrowserGate>` in `src/app/BrowserGate.tsx`). 

Specifically, when accessing `window.showDirectoryPicker` throws an exception (which occurs in sandboxed iframes, restricted security contexts, enterprise policies, or when property getters throw a `SecurityError`), the exception propagates synchronously into `<BrowserGate>`. This crashes React during mount/render, resulting in a blank screen and unhandled error instead of gracefully rendering the mandatory Chrome/Edge requirement screen (`#browser-gate-unsupported`).

This document provides:
1. Root cause analysis with call-stack evidence.
2. The exact, surgical fix strategy for `src/app/capabilities.ts` and `src/app/BrowserGate.tsx`.
3. The exact unit test specifications to be added to `tests/unit/browserGate.test.tsx`.
4. Verification commands to prove full resolution and pass the iteration gate.

---

## 2. Root Cause Analysis

### 2.1 The Vulnerability Chain

1. **Source Code Location**:
   `src/app/capabilities.ts`:
   ```typescript
   export function isFileSystemAccessSupported(): boolean {
     if (typeof window === 'undefined') {
       return false;
     }
     return (
       'showDirectoryPicker' in window &&
       typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
     );
   }
   ```

2. **Mechanism of Failure**:
   - At line 7, `(window as unknown as ...).showDirectoryPicker` triggers the `[[Get]]` internal property accessor.
   - In environments where permissions policy forbids the File System Access API (e.g. `sandbox="allow-scripts"` iframes, policy-restricted WebViews, or environments with security interceptor getters), accessing `window.showDirectoryPicker` throws a `DOMException` or `SecurityError`.
   - In `src/app/BrowserGate.tsx` line 10:
     ```typescript
     const isSupported = supportedOverride !== undefined ? supportedOverride : isFileSystemAccessSupported();
     ```
   - Because `isFileSystemAccessSupported()` has no `try...catch` block, the exception escapes synchronously during React component rendering.

3. **Reproduction Log Trace**:
   When tested with a throwing getter:
   ```
   Error: SecurityError: Access to File System Access API is restricted by policy.
       at get (.agents/teamwork/challenger_m1_1/stress_test_gate.test.tsx:115:15)
       at Module.isFileSystemAccessSupported (src/app/capabilities.ts:7:69)
       at BrowserGate (src/app/BrowserGate.tsx:10:77)
   The above error occurred in the <BrowserGate> component:
   ```
   - React aborts rendering.
   - The fallback DOM `#browser-gate-unsupported` is **never rendered**.
   - The user sees a blank screen and uncaught console error, directly violating Requirement R1 and Acceptance Criterion:
     *"In unsupported browsers lacking window.showDirectoryPicker, the app displays only the Chrome/Edge requirement message."*

---

## 3. Fix Strategy Formulation

A robust two-tier defense strategy is required:

### 3.1 Tier 1: Primary Guard in `src/app/capabilities.ts`
Wrap all property probing and type checking in a `try...catch` block. Any throwing property access or operator evaluation must return `false`.

#### Target File: `src/app/capabilities.ts`
```typescript
/**
 * Detects whether the browser environment supports the File System Access API
 * (specifically window.showDirectoryPicker for local directory selection).
 *
 * Safely guards against non-browser (SSR/Node) environments as well as throwing
 * property accessors (e.g., SecurityError in restricted iframes or policy blocks).
 */
export function isFileSystemAccessSupported(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return (
      'showDirectoryPicker' in window &&
      typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
    );
  } catch {
    return false;
  }
}
```

### 3.2 Tier 2: Defense-in-Depth in `src/app/BrowserGate.tsx`
Ensure that `<BrowserGate>` itself never crashes during render even if `isFileSystemAccessSupported()` or `supportedOverride` evaluation throws an unexpected error.

#### Target File: `src/app/BrowserGate.tsx`
```typescript
import type React from 'react';
import { isFileSystemAccessSupported } from './capabilities';

export interface BrowserGateProps {
  children: React.ReactNode;
  supportedOverride?: boolean;
}

export const BrowserGate: React.FC<BrowserGateProps> = ({ children, supportedOverride }) => {
  let isSupported = false;
  try {
    isSupported = supportedOverride !== undefined ? Boolean(supportedOverride) : isFileSystemAccessSupported();
  } catch {
    isSupported = false;
  }

  if (!isSupported) {
    return (
      <div
        id="browser-gate-unsupported"
        role="alert"
        aria-live="polite"
        className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-6"
      >
        <div className="max-w-md w-full bg-white rounded-lg border border-slate-200 p-8 shadow-sm text-center">
          <p className="text-base font-medium text-slate-800 leading-relaxed">
            This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default BrowserGate;
```

---

## 4. Test Strategy Formulation

In `tests/unit/browserGate.test.tsx`, the existing suite must be augmented with:
1. Safe descriptor restoration in `afterEach` so property getters cannot leak across unit tests.
2. Direct capability unit test for throwing getter on `window.showDirectoryPicker`.
3. Component rendering unit test verifying `<BrowserGate>` renders `#browser-gate-unsupported` without throwing when property access throws.
4. Component rendering unit test verifying `<BrowserGate>` handles throwing `supportedOverride`.

### 4.1 Teardown Enhancement in `tests/unit/browserGate.test.tsx`
```typescript
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'showDirectoryPicker');

  afterEach(() => {
    if (originalDescriptor !== undefined) {
      Object.defineProperty(window, 'showDirectoryPicker', originalDescriptor);
    } else {
      try {
        delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
      } catch {
        // Fallback for non-configurable descriptors if any
      }
    }
  });
```

### 4.2 Unit Tests to Add to `tests/unit/browserGate.test.tsx`

```typescript
  it('returns false without throwing when accessing window.showDirectoryPicker throws an error', () => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      get() {
        throw new Error('SecurityError: Access to File System Access API is restricted by policy.');
      },
    });

    expect(() => isFileSystemAccessSupported()).not.toThrow();
    expect(isFileSystemAccessSupported()).toBe(false);
  });

  it('renders ONLY the required unsupported message without crashing when showDirectoryPicker property access throws', () => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      get() {
        throw new Error('SecurityError: Access to File System Access API is restricted by policy.');
      },
    });

    let container: HTMLElement | null = null;
    expect(() => {
      const rendered = render(
        <BrowserGate>
          <div data-testid="app-shell">App Shell Content</div>
        </BrowserGate>
      );
      container = rendered.container;
    }).not.toThrow();

    const expectedText =
      'This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.';
    expect(screen.getByText(expectedText)).toBeInTheDocument();
    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();

    const alertBox = container?.querySelector('#browser-gate-unsupported');
    expect(alertBox).toBeInTheDocument();
    expect(alertBox?.textContent?.trim()).toBe(expectedText);
    expect(container?.querySelectorAll('button, input, select, textarea, a')).toHaveLength(0);
  });

  it('renders unsupported screen gracefully if supportedOverride evaluation throws', () => {
    const throwingOverride = {
      valueOf() {
        throw new Error('Override evaluation failure');
      },
    } as unknown as boolean;

    expect(() => {
      render(
        <BrowserGate supportedOverride={throwingOverride}>
          <div data-testid="app-shell">App Shell Content</div>
        </BrowserGate>
      );
    }).not.toThrow();

    expect(
      screen.getByText('This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.')
    ).toBeInTheDocument();
  });
```

---

## 5. Implementation Roadmap for Worker

1. Update `src/app/capabilities.ts` with `try...catch` wrapper.
2. Update `src/app/BrowserGate.tsx` with defensive `try...catch` wrapper.
3. Update `tests/unit/browserGate.test.tsx` with teardown protection and the 3 new adversarial test cases.
4. Run validation suite:
   - `npm test`
   - `npx vitest run --config .agents/teamwork/challenger_m1_1/vitest.stress.config.ts`
   - `npm run lint`
   - `npx tsc --noEmit`
   - `python -m unittest tools/test_validate_export.py`
