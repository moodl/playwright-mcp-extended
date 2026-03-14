/**
 * Extended Playwright MCP server — programmatic API.
 *
 * Wraps @playwright/mcp's createConnection and injects:
 * - Middleware init scripts (cookie consent)
 * - Custom tools (browser_read_page for full-page screenshot OCR)
 */

import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { createConnection as originalCreateConnection } from '@playwright/mcp';
import { getCombinedInitScript } from './middleware/index.js';
import { registerCustomTools } from './tools/read-page.js';

/**
 * Create an extended MCP connection with middleware and custom tools.
 *
 * @param {object} userConfig - Config to pass to the underlying @playwright/mcp
 * @param {object} middlewareOptions - Which middleware to enable
 * @param {boolean} middlewareOptions.cookieConsent - Auto-dismiss cookie banners (default: true)
 * @returns {Server} Extended MCP server
 */
export async function createConnection(userConfig = {}, middlewareOptions = {}) {
  const tmpDir = join(tmpdir(), `playwright-mcp-ext-${randomBytes(4).toString('hex')}`);
  mkdirSync(tmpDir, { recursive: true });
  const initScriptPath = join(tmpDir, 'init-middleware.js');
  writeFileSync(initScriptPath, getCombinedInitScript(middlewareOptions), 'utf-8');

  const existingInitScripts = userConfig.browser?.initScript ?? [];
  const mergedConfig = {
    ...userConfig,
    browser: {
      ...userConfig.browser,
      initScript: [...existingInitScripts, initScriptPath],
    },
  };

  const server = await originalCreateConnection(mergedConfig);

  // Register custom tools
  registerCustomTools(server);

  const cleanup = () => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  };

  const originalClose = server.close?.bind(server);
  if (originalClose) {
    server.close = async () => {
      cleanup();
      return originalClose();
    };
  }

  return server;
}

export { getCombinedInitScript };
export { registerCustomTools } from './tools/read-page.js';
export { dismissCookieConsent } from './middleware/index.js';
