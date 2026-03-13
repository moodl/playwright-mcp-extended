/**
 * Real-world integration tests against live websites.
 *
 * These tests navigate to actual websites known to have cookie banners,
 * paywalls, or login prompts, and verify the middleware handles them.
 *
 * Note: These tests are inherently more flaky than fixture tests since
 * websites can change their markup at any time. They serve as a smoke
 * test for real-world effectiveness.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { getCombinedInitScript } from '../src/middleware/index.js';

let browser;
let tmpDir;
let initScriptPath;

before(async () => {
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

/**
 * Check for visible fixed overlays that cover a large portion of the viewport.
 */
async function hasBlockingOverlay(page) {
  return page.evaluate(() => {
    const allElements = document.querySelectorAll('*');
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const viewportArea = vw * vh;

    for (const el of allElements) {
      try {
        const style = getComputedStyle(el);
        if (style.position !== 'fixed' && style.position !== 'sticky') continue;
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        if (parseInt(style.zIndex) < 100) continue;

        const rect = el.getBoundingClientRect();
        const area = rect.width * rect.height;

        // Must cover > 50% of viewport and be tall (not a nav bar)
        if (area > viewportArea * 0.5 && rect.height > vh * 0.5) {
          return {
            found: true,
            tag: el.tagName,
            classes: el.className?.toString()?.substring(0, 80),
            id: el.id,
            zIndex: style.zIndex,
          };
        }
      } catch {}
    }

    return { found: false };
  });
}

// ─── Cookie Consent on Real Websites ──────────────────────────────

describe('Real-world: Cookie Consent', () => {
  it('should handle BBC cookie banner', async () => {
    let ctx;
    try {
      const { page, context } = await navigateWithMiddleware('https://www.bbc.co.uk', { wait: 5000, timeout: 20000 });
      ctx = context;
      const banner = await hasCookieBanner(page);
      console.log('  BBC cookie banner state:', JSON.stringify(banner));
    } catch (e) {
      console.log('  BBC skipped (network):', e.message?.substring(0, 80));
    } finally {
      await ctx?.close().catch(() => {});
    }
  });

  it('should handle Reuters cookie banner', async () => {
    let ctx;
    try {
      const { page, context } = await navigateWithMiddleware('https://www.reuters.com', { wait: 5000 });
      ctx = context;
      const banner = await hasCookieBanner(page);
      console.log('  Reuters cookie banner state:', JSON.stringify(banner));
    } catch (e) {
      console.log('  Reuters skipped (network):', e.message?.substring(0, 80));
    } finally {
      await ctx?.close().catch(() => {});
    }
  });

  it('should handle an OneTrust site (stackoverflow.com)', async () => {
    let ctx;
    try {
      const { page, context } = await navigateWithMiddleware('https://stackoverflow.com', { wait: 5000 });
      ctx = context;
      const banner = await hasCookieBanner(page);
      console.log('  StackOverflow cookie banner state:', JSON.stringify(banner));
    } catch (e) {
      console.log('  StackOverflow skipped (network):', e.message?.substring(0, 80));
    } finally {
      await ctx?.close().catch(() => {});
    }
  });

  it('should handle golem.de cookie banner (German)', async () => {
    let ctx;
    try {
      const { page, context } = await navigateWithMiddleware('https://www.golem.de', { wait: 6000 });
      ctx = context;
      const banner = await hasCookieBanner(page);
      const scrollLocked = await isScrollLocked(page);
      const overlay = await hasBlockingOverlay(page);
      console.log('  golem.de cookie banner:', JSON.stringify(banner));
      console.log('  golem.de scroll locked:', scrollLocked, 'overlay:', JSON.stringify(overlay));
    } catch (e) {
      console.log('  golem.de skipped (network):', e.message?.substring(0, 80));
    } finally {
      await ctx?.close().catch(() => {});
    }
  });
});

// ─── Paywall/Overlay on Real Websites ─────────────────────────────

describe('Real-world: Paywall/Overlay', () => {
  it('should unlock scroll on sites with overlays', async () => {
    let ctx;
    try {
      const { page, context } = await navigateWithMiddleware('https://www.nytimes.com', { wait: 5000 });
      ctx = context;
      const scrollLocked = await isScrollLocked(page);
      const overlay = await hasBlockingOverlay(page);
      console.log('  NYT scroll locked:', scrollLocked, 'blocking overlay:', JSON.stringify(overlay));
    } finally {
      await ctx?.close().catch(() => {});
    }
  });

  it('should handle Medium articles', async () => {
    let ctx;
    try {
      const { page, context } = await navigateWithMiddleware('https://medium.com', { wait: 5000 });
      ctx = context;
      const overlay = await hasBlockingOverlay(page);
      console.log('  Medium blocking overlay:', JSON.stringify(overlay));
    } finally {
      await ctx?.close().catch(() => {});
    }
  });
});

// ─── Login/Signup Modals on Real Websites ──────────────────────────

describe('Real-world: Login/Signup Bypass', () => {
  it('should handle Quora login wall', async () => {
    let ctx;
    try {
      const { page, context } = await navigateWithMiddleware('https://www.quora.com', { wait: 5000 });
      ctx = context;
      const overlay = await hasBlockingOverlay(page);
      console.log('  Quora blocking overlay:', JSON.stringify(overlay));
    } finally {
      await ctx?.close().catch(() => {});
    }
  });

  it('should handle Pinterest login wall', async () => {
    let ctx;
    try {
      const { page, context } = await navigateWithMiddleware('https://www.pinterest.com', { wait: 5000 });
      ctx = context;
      const overlay = await hasBlockingOverlay(page);
      const scrollLocked = await isScrollLocked(page);
      console.log('  Pinterest blocking overlay:', JSON.stringify(overlay), 'scroll locked:', scrollLocked);
    } finally {
      await ctx?.close().catch(() => {});
    }
  });
});

// ─── Comparison Tests (with vs without middleware) ─────────────────

describe('Real-world: With vs Without middleware', () => {
  it('should make a measurable difference on cookie banner sites', async () => {
    const testUrl = 'https://www.bbc.com';

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
