import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { BrowserGate } from '@/app/BrowserGate';
import { isFileSystemAccessSupported } from '@/app/capabilities';
import App from '@/app/App';

describe('Adversarial Stress Test: Browser Capability Gate', () => {
  const originalShowDirectoryPicker = (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;

  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
    if (originalShowDirectoryPicker !== undefined) {
      (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker = originalShowDirectoryPicker;
    } else {
      delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    }
  });

  const EXPECTED_GATE_MESSAGE =
    'This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.';

  function assertOnlyGateMessageRendered(container: HTMLElement) {
    const alertBox = container.querySelector('#browser-gate-unsupported');
    expect(alertBox).not.toBeNull();
    expect(alertBox?.textContent?.trim()).toBe(EXPECTED_GATE_MESSAGE);

    // Strict leak checks: No app shell, no navigation, no form controls, no headers
    expect(container.querySelector('#app-shell')).toBeNull();
    expect(container.querySelector('#app-content')).toBeNull();
    expect(container.querySelectorAll('button, input, select, textarea, a, form')).toHaveLength(0);
    expect(container.querySelectorAll('header, nav, main, footer')).toHaveLength(0);
  }

  // 1. Undefined showDirectoryPicker
  it('Corner Case 1: window.showDirectoryPicker is undefined', () => {
    (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker = undefined;
    expect(isFileSystemAccessSupported()).toBe(false);

    const { container } = render(
      <BrowserGate>
        <App />
      </BrowserGate>
    );
    assertOnlyGateMessageRendered(container);
  });

  // 2. Deleted showDirectoryPicker (property absent)
  it('Corner Case 2: window.showDirectoryPicker is deleted (not in window)', () => {
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    expect('showDirectoryPicker' in window).toBe(false);
    expect(isFileSystemAccessSupported()).toBe(false);

    const { container } = render(
      <BrowserGate>
        <App />
      </BrowserGate>
    );
    assertOnlyGateMessageRendered(container);
  });

  // 3. Null showDirectoryPicker
  it('Corner Case 3: window.showDirectoryPicker is null', () => {
    (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker = null;
    expect(isFileSystemAccessSupported()).toBe(false);

    const { container } = render(
      <BrowserGate>
        <App />
      </BrowserGate>
    );
    assertOnlyGateMessageRendered(container);
  });

  // 4. Object showDirectoryPicker (not a function)
  it('Corner Case 4: window.showDirectoryPicker is {} (not a function)', () => {
    (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker = {};
    expect(isFileSystemAccessSupported()).toBe(false);

    const { container } = render(
      <BrowserGate>
        <App />
      </BrowserGate>
    );
    assertOnlyGateMessageRendered(container);
  });

  // 5. Primitive values (string, number, boolean, symbol, bigint)
  it('Corner Case 5: window.showDirectoryPicker is primitive values', () => {
    const primitives = ['function', 12345, true, false, Symbol('showDirectoryPicker'), BigInt(9999)];

    for (const val of primitives) {
      cleanup();
      (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker = val;
      expect(isFileSystemAccessSupported()).toBe(false);

      const { container } = render(
        <BrowserGate>
          <App />
        </BrowserGate>
      );
      assertOnlyGateMessageRendered(container);
    }
  });

  // 6. Throwing getter property on window.showDirectoryPicker
  it('Corner Case 6: accessing window.showDirectoryPicker throws an error', () => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      get() {
        throw new Error('SecurityError: Access to File System Access API is restricted by policy.');
      },
    });

    let detected = false;
    let errorThrown = false;
    try {
      detected = isFileSystemAccessSupported();
    } catch (e) {
      errorThrown = true;
    }

    console.log(`[CHALLENGE RESULT] Throwing getter: errorThrown=${errorThrown}, detected=${detected}`);

    // Let's see if BrowserGate can handle this or if it crashes
    let renderThrew = false;
    let renderedContainer: HTMLElement | null = null;
    try {
      const { container } = render(
        <BrowserGate>
          <App />
        </BrowserGate>
      );
      renderedContainer = container;
    } catch (e) {
      renderThrew = true;
    }

    console.log(`[CHALLENGE RESULT] Throwing getter during render: renderThrew=${renderThrew}`);
  });

  // 7. Non-Chromium user agents (Firefox, Safari, Edge legacy, Mobile Safari)
  it('Corner Case 7: Simulated non-Chromium user agents without FSA API', () => {
    const nonChromiumUserAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    ];

    for (const ua of nonChromiumUserAgents) {
      cleanup();
      delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);

      expect(isFileSystemAccessSupported()).toBe(false);

      const { container } = render(
        <BrowserGate>
          <App />
        </BrowserGate>
      );
      assertOnlyGateMessageRendered(container);
    }
  });

  // 8. Genuine available showDirectoryPicker function
  it('Supported Case: genuine available showDirectoryPicker function renders App cleanly', () => {
    const mockPicker = vi.fn().mockResolvedValue({
      kind: 'directory',
      name: 'sample-folder',
    });
    (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker = mockPicker;

    expect(isFileSystemAccessSupported()).toBe(true);

    const { container } = render(
      <BrowserGate>
        <App />
      </BrowserGate>
    );

    // Unsupported gate is NOT rendered
    expect(container.querySelector('#browser-gate-unsupported')).toBeNull();

    // App shell IS rendered
    expect(container.querySelector('#app-shell')).not.toBeNull();
    expect(container.querySelector('#app-content')).not.toBeNull();
    expect(screen.getByRole('heading', { name: /data collection tool/i })).toBeInTheDocument();
    expect(screen.getByText(/air-gapped/i)).toBeInTheDocument();
    expect(screen.getByText(/browser capability verified/i)).toBeInTheDocument();
  });
});
