#!/usr/bin/env node

/**
 * CLI for playwright-mcp-extended.
 *
 * Programmatic MCP server that wraps @playwright/mcp with:
 * - Middleware init scripts (cookie consent)
 * - Custom tools (browser_read_page for full-page screenshot OCR)
 *
 * All original @playwright/mcp CLI options are supported, plus:
 *   --no-cookie-consent       Disable cookie consent auto-dismiss
 */

import { readFileSync } from 'node:fs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createConnection } from './index.js';

const args = process.argv.slice(2);

// --- Parse flags ---
const middlewareOptions = {
  cookieConsent: true,
};

const config = {
  browser: {
    launchOptions: {},
    initScript: [],
  },
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  switch (arg) {
    case '--no-cookie-consent':
      middlewareOptions.cookieConsent = false;
      break;
    case '--headless':
      config.browser.launchOptions.headless = true;
      break;
    case '--headed':
      config.browser.launchOptions.headless = false;
      break;
    case '--browser':
      config.browser.browserName = args[++i];
      break;
    case '--caps':
      config.capabilities = args[++i].split(',').map(s => s.trim());
      break;
    case '--cdp-endpoint':
      config.browser.cdpEndpoint = args[++i];
      break;
    case '--user-data-dir':
      config.browser.userDataDir = args[++i];
      break;
    case '--isolated':
      config.browser.isolated = true;
      break;
    case '--port':
      config.server = config.server || {};
      config.server.port = parseInt(args[++i], 10);
      break;
    case '--host':
      config.server = config.server || {};
      config.server.host = args[++i];
      break;
    case '--vision':
      config.capabilities = config.capabilities || [];
      if (!config.capabilities.includes('vision')) config.capabilities.push('vision');
      break;
    case '--init-script':
      config.browser.initScript.push(args[++i]);
      break;
    case '--config':
      Object.assign(config, JSON.parse(readFileSync(args[++i], 'utf-8')));
      break;
  }
}

// --- Create the server and connect transport ---
// createConnection handles: init script injection, custom tool registration, cleanup
const server = await createConnection(config, middlewareOptions);

const transport = new StdioServerTransport();
await server.connect(transport);
