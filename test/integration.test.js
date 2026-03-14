/**
 * Integration tests for playwright-mcp-extended middleware.
 *
 * Spins up a local test server with fixture pages, launches a real browser
 * with the middleware init scripts injected, and verifies that cookie banners
 * are automatically handled.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { getCombinedInitScript } from '../src/middleware/index.js';
import { startTestServer } from './server.js';

let server;
let browser;
let context;
let initScriptPath;
let tmpDir;

before(async () => {
  // Start test server
  server = await startTestServer();

  // Write init script to temp file
  tmpDir = join(tmpdir(), `pw-mcp-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(tmpDir, { recursive: true });
  initScriptPath = join(tmpDir, 'init-middleware.js');
  writeFileSync(initScriptPath, getCombinedInitScript(), 'utf-8');

  // Launch browser
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

/**
 * Helper: create a fresh context with our init script and navigate to a fixture.
 */
async function loadFixture(fixture) {
  if (context) await context.close().catch(() => {});
  context = await browser.newContext();
  await context.addInitScript({ path: initScriptPath });
  const page = await context.newPage();
  await page.goto(`${server.url}/${fixture}`, { waitUntil: 'domcontentloaded' });
  // Wait for load + middleware retries
  await page.waitForLoadState('load');
  return page;
}

/**
 * Helper: wait for a condition with timeout.
 */
async function waitFor(page, fn, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await page.evaluate(fn).catch(() => false);
    if (result) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

// ─── Cookie Consent Tests ──────────────────────────────────────────

describe('Cookie Consent Middleware', () => {
  it('should dismiss OneTrust-style cookie banner', async () => {
    const page = await loadFixture('cookie-banner.html');

    const dismissed = await waitFor(page, () => {
      return document.body.getAttribute('data-cookie-dismissed') === 'true';
    });
    assert.ok(dismissed, 'OneTrust banner should be dismissed');

    const bannerVisible = await page.isVisible('#onetrust-banner-sdk');
    assert.ok(!bannerVisible, 'Banner element should be hidden');
  });

  it('should dismiss generic cookie consent popup via text matching', async () => {
    const page = await loadFixture('cookie-banner-generic.html');

    const dismissed = await waitFor(page, () => {
      return document.body.getAttribute('data-cookie-dismissed') === 'true';
    });
    assert.ok(dismissed, 'Generic cookie banner should be dismissed via "Accept All" text match');
  });

  it('should dismiss delayed Cookiebot-style banner', async () => {
    const page = await loadFixture('cookie-banner-delayed.html');

    // Banner appears after 800ms; middleware retries at 500ms, 1500ms, 3000ms
    const dismissed = await waitFor(page, () => {
      return document.body.getAttribute('data-cookie-dismissed') === 'true';
    }, 6000);
    assert.ok(dismissed, 'Delayed cookie banner should be dismissed by retry mechanism');
  });
});

// ─── Iframe CMP & Advanced Cookie Tests ──────────────────────────

describe('Iframe-based CMP Removal', () => {
  it('should remove SourcePoint-style iframe CMP container and restore scroll', async () => {
    const page = await loadFixture('cookie-iframe-cmp.html');

    const removed = await waitFor(page, () => {
      return !document.getElementById('sp_message_container_12345');
    });
    assert.ok(removed, 'SourcePoint container should be removed');

    const htmlClass = await page.evaluate(() => document.documentElement.className);
    assert.ok(!htmlClass.includes('sp-message-open'), 'sp-message-open class should be removed from html');

    const bodyOverflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
    assert.notEqual(bodyOverflow, 'hidden', 'Body scroll should be restored');
  });

  it('should also dismiss the secondary native cookie bar', async () => {
    const page = await loadFixture('cookie-iframe-cmp.html');

    const dismissed = await waitFor(page, () => {
      const el = document.getElementById('cookiePrompt');
      if (!el) return true;
      const style = getComputedStyle(el);
      return style.display === 'none' || el.offsetHeight === 0;
    });
    assert.ok(dismissed, 'Native #cookiePrompt bar should be dismissed or hidden');
  });
});

describe('Dynamically Injected CMP', () => {
  it('should dismiss a cookie banner injected after page load via MutationObserver', async () => {
    const page = await loadFixture('cookie-dynamic-inject.html');

    const dismissed = await waitFor(page, () => {
      return document.body.getAttribute('data-cookie-dismissed') === 'true'
        || !document.querySelector('.consent-overlay');
    }, 6000);
    assert.ok(dismissed, 'Dynamically injected consent overlay should be dismissed');
  });
});

describe('Quantcast-style CMP', () => {
  it('should click Agree button in Quantcast-style CMP', async () => {
    const page = await loadFixture('cookie-quantcast-style.html');

    const dismissed = await waitFor(page, () => {
      return document.body.getAttribute('data-cookie-dismissed') === 'true';
    });
    assert.ok(dismissed, 'Quantcast-style CMP should be dismissed via Agree button');

    const visible = await page.isVisible('#qc-cmp2-container');
    assert.ok(!visible, 'QC container should be hidden');
  });
});

// ─── Middleware Toggle Tests ───────────────────────────────────────

describe('Middleware can be selectively disabled', () => {
  it('should NOT dismiss cookie banner when cookieConsent is disabled', async () => {
    // Create a context WITHOUT cookie consent middleware
    const partialScript = getCombinedInitScript({ cookieConsent: false });
    const partialPath = join(tmpDir, 'init-none.js');
    writeFileSync(partialPath, partialScript, 'utf-8');

    if (context) await context.close().catch(() => {});
    context = await browser.newContext();
    await context.addInitScript({ path: partialPath });
    const page = await context.newPage();
    await page.goto(`${server.url}/cookie-banner.html`, { waitUntil: 'load' });

    // Wait a bit and verify banner is still there
    await new Promise(r => setTimeout(r, 2000));
    const dismissed = await page.evaluate(() => document.body.getAttribute('data-cookie-dismissed') === 'true');
    assert.ok(!dismissed, 'Cookie banner should NOT be dismissed when middleware is disabled');

    const bannerVisible = await page.isVisible('#onetrust-banner-sdk');
    assert.ok(bannerVisible, 'Banner should still be visible');
  });
});
