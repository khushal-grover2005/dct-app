import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Security & CSP Baseline Verification', () => {
  const rootDir = path.resolve(__dirname, '../../../');
  const indexHtmlPath = path.join(rootDir, 'index.html');
  const viteConfigPath = path.join(rootDir, 'vite.config.ts');

  it('index.html exists and contains canonical Content-Security-Policy meta tag', () => {
    expect(fs.existsSync(indexHtmlPath)).toBe(true);
    const html = fs.readFileSync(indexHtmlPath, 'utf-8');

    // Canonical CSP string per data-contract / app-design
    const expectedDirectives = [
      "default-src 'self'",
      "img-src 'self' blob:",
      "media-src blob:",
      "frame-src blob:",
      "object-src 'none'",
      "connect-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
    ];

    const cspMetaRegex = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*\/?>/i;
    const match = html.match(cspMetaRegex);
    expect(match).not.toBeNull();

    const content = match![1];
    for (const directive of expectedDirectives) {
      expect(content).toContain(directive);
    }
  });

  it('index.html contains zero external remote HTTP/HTTPS URLs', () => {
    const html = fs.readFileSync(indexHtmlPath, 'utf-8');
    // Ignore doctype/namespaces if any; check for external src or href
    const externalUrlRegex = /(?:src|href)=["']https?:\/\/[^"']+["']/gi;
    const matches = html.match(externalUrlRegex);
    expect(matches).toBeNull();
  });

  it('vite.config.ts configures CSP headers for both dev and preview servers', () => {
    expect(fs.existsSync(viteConfigPath)).toBe(true);
    const config = fs.readFileSync(viteConfigPath, 'utf-8');

    expect(config).toContain("connect-src 'none'");
    expect(config).toContain('Content-Security-Policy');
    expect(config).toContain('hmr: false');
  });
});
