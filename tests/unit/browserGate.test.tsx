import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserGate } from '@/app/BrowserGate';
import { isFileSystemAccessSupported } from '@/app/capabilities';
import App from '@/app/App';

describe('BrowserGate Capability & UI Gating', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'showDirectoryPicker');

  afterEach(() => {
    if (originalDescriptor !== undefined) {
      Object.defineProperty(window, 'showDirectoryPicker', originalDescriptor);
    } else {
      try {
        delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
      } catch {
        // Safe fallback for non-configurable property in test environments
      }
    }
  });

  it('detects capability accurately in capability helper', () => {
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    expect(isFileSystemAccessSupported()).toBe(false);

    window.showDirectoryPicker = vi.fn();
    expect(isFileSystemAccessSupported()).toBe(true);

    // Non-function value test
    (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = 'not-a-function';
    expect(isFileSystemAccessSupported()).toBe(false);
  });

  it('renders ONLY the required unsupported message when showDirectoryPicker is missing', () => {
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;

    const { container } = render(
      <BrowserGate>
        <div data-testid="app-shell">App Shell Content</div>
      </BrowserGate>
    );

    const expectedText =
      'This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.';
    expect(screen.getByText(expectedText)).toBeInTheDocument();
    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();

    // Verify "and nothing else" constraint: only the message paragraph is rendered inside the alert container
    const alertBox = container.querySelector('#browser-gate-unsupported');
    expect(alertBox).toBeInTheDocument();
    expect(alertBox?.textContent?.trim()).toBe(expectedText);
    expect(container.querySelectorAll('button, input, select, textarea, a')).toHaveLength(0);
  });

  it('renders application children when showDirectoryPicker is supported', () => {
    window.showDirectoryPicker = vi.fn();

    render(
      <BrowserGate>
        <div data-testid="app-shell">App Shell Content</div>
      </BrowserGate>
    );

    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.queryByText(/requires desktop Google Chrome or Microsoft Edge/i)).not.toBeInTheDocument();
  });

  it('honors supportedOverride prop for isolated testing', () => {
    window.showDirectoryPicker = vi.fn(); // window is supported

    // Force override to false
    render(
      <BrowserGate supportedOverride={false}>
        <div data-testid="app-shell">App Shell Content</div>
      </BrowserGate>
    );

    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();
    expect(
      screen.getByText('This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.')
    ).toBeInTheDocument();

    // Force override to true when window is unsupported
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    const { unmount } = render(
      <BrowserGate supportedOverride={true}>
        <div data-testid="override-shell">Shell Enabled</div>
      </BrowserGate>
    );
    expect(screen.getByTestId('override-shell')).toBeInTheDocument();
    unmount();
  });

  it('renders application shell in supported environments', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /data collection tool/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/air-gapped/i)).toBeInTheDocument();
    expect(screen.getByText(/browser capability verified/i)).toBeInTheDocument();
  });

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

    let renderedContainer: HTMLElement | undefined;
    expect(() => {
      const rendered = render(
        <BrowserGate>
          <div data-testid="app-shell">App Shell Content</div>
        </BrowserGate>
      );
      renderedContainer = rendered.container;
    }).not.toThrow();

    const expectedText =
      'This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly.';
    expect(screen.getByText(expectedText)).toBeInTheDocument();
    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();

    const alertBox = (renderedContainer as HTMLElement | undefined)?.querySelector('#browser-gate-unsupported');
    expect(alertBox).toBeInTheDocument();
    expect(alertBox?.textContent?.trim()).toBe(expectedText);
    expect((renderedContainer as HTMLElement | undefined)?.querySelectorAll('button, input, select, textarea, a')).toHaveLength(0);
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
});

