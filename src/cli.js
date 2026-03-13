#!/usr/bin/env node

/**
 * CLI for playwright-mcp-extended.
 *
 * Drop-in replacement for `npx @playwright/mcp` that injects middleware
 * for cookie consent, paywall bypass, and login screen handling.
 *
 * All original @playwright/mcp CLI options are supported, plus:
 *   --no-cookie-consent     Disable cookie consent auto-dismiss
 *   --no-paywall-bypass     Disable paywall bypass
 *   --no-login-bypass       Disable login/signup modal bypass
 */

import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { getCombinedInitScript } from './middleware/index.js';

const args = process.argv.slice(2);

// Parse our custom flags and remove them before passing to playwright-mcp
const middlewareOptions = {
  cookieConsent: true,
  paywallBypass: true,
  loginBypass: true,
};

const filteredArgs = [];
for (const arg of args) {
  switch (arg) {
    case '--no-cookie-consent':
      middlewareOptions.cookieConsent = false;
      break;
    case '--no-paywall-bypass':
      middlewareOptions.paywallBypass = false;
      break;
    case '--no-login-bypass':
      middlewareOptions.loginBypass = false;
      break;
    default:
      filteredArgs.push(arg);
  }
}

// Write the combined init script to a temp file
const tmpDir = join(tmpdir(), `playwright-mcp-ext-${randomBytes(4).toString('hex')}`);
mkdirSync(tmpDir, { recursive: true });
const initScriptPath = join(tmpDir, 'init-middleware.js');
writeFileSync(initScriptPath, getCombinedInitScript(middlewareOptions), 'utf-8');

// Clean up on exit
function cleanup() {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

// Add our init script to the args
filteredArgs.push('--init-script', initScriptPath);

// Spawn the original playwright-mcp CLI with our args
import { spawn } from 'node:child_process';

const child = spawn('npx', ['@playwright/mcp', ...filteredArgs], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  cleanup();
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  console.error(`Failed to start playwright-mcp: ${err.message}`);
  cleanup();
  process.exit(1);
});
