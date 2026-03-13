/**
 * Integration tests for playwright-mcp-extended middleware.
 *
 * Spins up a local test server with fixture pages, launches a real browser
 * with the middleware init scripts injected, and verifies that cookie banners,
 * paywalls, and login modals are automatically handled.
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

// ─── Paywall Bypass Tests ──────────────────────────────────────────

describe('Paywall Bypass Middleware', () => {
  it('should remove soft paywall overlay and restore content', async () => {
    const page = await loadFixture('paywall-soft.html');

    const removed = await waitFor(page, () => {
      return document.body.getAttribute('data-paywall-removed') === 'true';
    });
    assert.ok(removed, 'Paywall overlay should be removed');

    // Verify scroll is unlocked
    const bodyOverflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
    assert.notEqual(bodyOverflow, 'hidden', 'Body scroll should be unlocked');

    // Verify article content is unblurred
    const filter = await page.evaluate(() => {
      const article = document.querySelector('.article-content');
      return getComputedStyle(article).filter;
    });
    assert.ok(filter === 'none' || !filter.includes('blur'), 'Article should not be blurred');
  });

  it('should remove Piano/Tinypass-style metered paywall', async () => {
    const page = await loadFixture('paywall-metered.html');

    const removed = await waitFor(page, () => {
      return document.body.getAttribute('data-paywall-removed') === 'true';
    });
    assert.ok(removed, 'Piano modal and backdrop should be removed');

    // Verify body scroll is restored
    const bodyOverflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
    assert.notEqual(bodyOverflow, 'hidden', 'Body scroll should be unlocked');
  });
});

// ─── Login/Signup Bypass Tests ─────────────────────────────────────

describe('Login Bypass Middleware', () => {
  it('should dismiss login modal via close button', async () => {
    const page = await loadFixture('login-modal.html');

    const dismissed = await waitFor(page, () => {
      return document.body.getAttribute('data-login-dismissed') === 'true';
    });
    assert.ok(dismissed, 'Login modal should be dismissed');

    const modalVisible = await page.isVisible('#login-modal');
    assert.ok(!modalVisible, 'Login modal should not be visible');

    const backdropVisible = await page.isVisible('#backdrop');
    assert.ok(!backdropVisible, 'Backdrop should not be visible');
  });

  it('should remove Google One-Tap prompt', async () => {
    const page = await loadFixture('login-google-onetap.html');

    const removed = await waitFor(page, () => {
      return document.body.getAttribute('data-onetap-removed') === 'true';
    });
    assert.ok(removed, 'Google One-Tap container should be removed');
  });

  it('should dismiss registration wall via "No thanks" link', async () => {
    const page = await loadFixture('regwall.html');

    const dismissed = await waitFor(page, () => {
      return document.body.getAttribute('data-regwall-dismissed') === 'true';
    });
    assert.ok(dismissed, 'Registration wall should be dismissed via "No thanks" text match');
  });
});

// ─── Middleware Toggle Tests ───────────────────────────────────────

describe('Middleware can be selectively disabled', () => {
  it('should NOT dismiss cookie banner when cookieConsent is disabled', async () => {
    // Create a context WITHOUT cookie consent middleware
    const partialScript = getCombinedInitScript({ cookieConsent: false, paywallBypass: false, loginBypass: false });
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
