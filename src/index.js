/**
 * Extended Playwright MCP server — programmatic API.
 *
 * Wraps @playwright/mcp's createConnection and injects middleware init scripts
 * into the browser context for cookie consent, paywall bypass, and login bypass.
 */

import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { createConnection as originalCreateConnection } from '@playwright/mcp';
import { getCombinedInitScript } from './middleware/index.js';

/**
 * Create an extended MCP connection with middleware injected.
 *
 * @param {object} userConfig - Config to pass to the underlying @playwright/mcp
 * @param {object} middlewareOptions - Which middleware to enable
 * @param {boolean} middlewareOptions.cookieConsent - Auto-dismiss cookie banners (default: true)
 * @param {boolean} middlewareOptions.paywallBypass - Bypass soft paywalls (default: true)
 * @param {boolean} middlewareOptions.loginBypass - Dismiss login/signup modals (default: true)
 * @returns {{ server, cleanup }} MCP server and cleanup function
 */
export async function createConnection(userConfig = {}, middlewareOptions = {}) {
  // Write combined init script to a temp file (required by Playwright MCP)
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

  const cleanup = () => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  };

  // Auto-cleanup when server closes
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
export { dismissCookieConsent, bypassPaywall, bypassLoginScreens } from './middleware/index.js';
