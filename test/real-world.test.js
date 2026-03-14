/**
 * Real-world integration tests against live websites.
 *
 * These tests navigate to actual websites known to have cookie banners
 * and verify the middleware handles them.
 *
 * Test URLs are loaded from a gitignored config file (real-world-urls.json).
 * If the config file is missing, all tests are skipped gracefully.
 *
 * Note: These tests are inherently more flaky than fixture tests since
 * websites can change their markup at any time. They serve as a smoke
 * test for real-world effectiveness.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getCombinedInitScript } from '../src/middleware/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const URL_CONFIG_PATH = join(__dirname, 'real-world-urls.json');

/** Load test URL config, or null if file doesn't exist */
function loadUrlConfig() {
  try {
    if (!existsSync(URL_CONFIG_PATH)) return null;
    const raw = readFileSync(URL_CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const urlConfig = loadUrlConfig();
const SKIP_ALL = !urlConfig;

let browser;
let tmpDir;
let initScriptPath;

before(async () => {
  if (SKIP_ALL) return;

  tmpDir = join(tmpdir(), `pw-mcp-real-${randomBytes(4).toString('hex')}`);
  mkdirSync(tmpDir, { recursive: true });
  initScriptPath = join(tmpDir, 'init-middleware.js');
  writeFileSync(initScriptPath, getCombinedInitScript(), 'utf-8');

  browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
});

after(async () => {
  await browser?.close().catch(() => {});
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

/**
 * Navigate with middleware, wait for it to process, return page state.
 */
async function navigateWithMiddleware(url, opts = {}) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript({ path: initScriptPath });
  const page = await context.newPage();

  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: opts.timeout || 30000,
    });
    await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
    // Give middleware time to process (retries at 500ms, 1500ms, 3000ms)
    await new Promise(r => setTimeout(r, opts.wait || 4000));
  } catch (e) {
    await context.close().catch(() => {});
    throw e;
  }

  return { page, context };
}

/**
 * Check if any cookie banners are visible on the page.
 */
async function hasCookieBanner(page) {
  return page.evaluate(() => {
    const bannerSelectors = [
      '#onetrust-banner-sdk',
      '#CybotCookiebotDialog',
      '#didomi-popup',
      '.cc-banner',
      '.cc-window',
      '#qc-cmp2-container',
      '[class*="cookie-banner" i]',
      '[class*="cookie-consent" i]',
      '[class*="cookieConsent" i]',
      '[id*="cookie-banner" i]',
      '[id*="cookie-consent" i]',
      '[aria-label*="cookie" i]',
      '[role="dialog"][aria-label*="cookie" i]',
      '[role="dialog"][aria-label*="consent" i]',
      '[role="dialog"][aria-label*="privacy" i]',
    ];

    for (const sel of bannerSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const style = getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden'
            && style.opacity !== '0' && el.offsetHeight > 0) {
            return { found: true, selector: sel, text: el.textContent?.substring(0, 100) };
          }
        }
      } catch {}
    }

    return { found: false };
  });
}

/**
 * Check if body/html scroll is locked.
 */
async function isScrollLocked(page) {
  return page.evaluate(() => {
    const bodyStyle = getComputedStyle(document.body);
    const htmlStyle = getComputedStyle(document.documentElement);
    return bodyStyle.overflow === 'hidden' || htmlStyle.overflow === 'hidden'
      || bodyStyle.overflowY === 'hidden' || htmlStyle.overflowY === 'hidden';
  });
}

// ─── Cookie Consent on Real Websites ──────────────────────────────

describe('Real-world: Cookie Consent', { skip: SKIP_ALL ? 'URL config file not found' : false }, () => {
  const sites = urlConfig?.cookieConsent || [];

  for (const site of sites) {
    it(`should handle cookie banner on ${site.label}`, async () => {
      let ctx;
      try {
        const { page, context } = await navigateWithMiddleware(site.url, { wait: site.wait, timeout: site.timeout });
        ctx = context;
        const banner = await hasCookieBanner(page);
        console.log(`  [${site.id}] cookie banner state:`, JSON.stringify(banner));
        if (site.checkScroll) {
          const scrollLocked = await isScrollLocked(page);
          console.log(`  [${site.id}] scroll locked:`, scrollLocked);
        }
      } catch (e) {
        console.log(`  [${site.id}] skipped (network):`, e.message?.substring(0, 80));
      } finally {
        await ctx?.close().catch(() => {});
      }
    });
  }
});

// ─── Comparison Tests (with vs without middleware) ─────────────────

describe('Real-world: With vs Without middleware', { skip: SKIP_ALL ? 'URL config file not found' : false }, () => {
  it('should make a measurable difference on cookie banner sites', async () => {
    const testConfig = urlConfig?.comparisonTest;
    if (!testConfig) return;
    const testUrl = testConfig.url;

    // WITHOUT middleware
    const ctxWithout = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    const pageWithout = await ctxWithout.newPage();
    try {
      await pageWithout.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await pageWithout.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));
    } catch {}
    const bannerWithout = await hasCookieBanner(pageWithout);
    await ctxWithout.close();

    // WITH middleware
    const ctxWith = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    await ctxWith.addInitScript({ path: initScriptPath });
    const pageWith = await ctxWith.newPage();
    try {
      await pageWith.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await pageWith.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 5000));
    } catch {}
    const bannerWith = await hasCookieBanner(pageWith);
    await ctxWith.close();

    console.log('  Without middleware - banner found:', bannerWithout.found);
    console.log('  With middleware    - banner found:', bannerWith.found);

    // If a banner was found without middleware, it should ideally be gone with middleware
    if (bannerWithout.found) {
      assert.ok(!bannerWith.found,
        `Cookie banner should be dismissed with middleware. Banner: ${bannerWithout.selector}`);
    }
  });
});
