/**
 * Paywall bypass middleware — removes overlay elements, scroll-lock CSS,
 * and blur effects that soft paywalls use to block content.
 *
 * This targets "soft" paywalls (content is in the DOM but hidden behind overlays).
 * Hard paywalls (content not delivered to the client) cannot be bypassed client-side.
 *
 * Strategies:
 * 1. Remove fixed/sticky overlay elements that block the page
 * 2. Remove scroll-lock styles from body/html
 * 3. Remove blur/opacity filters on article content
 * 4. Expand truncated article containers
 * 5. Remove "read more" / "subscribe" interstitials
 */

const PAYWALL_OVERLAY_SELECTORS = [
  // Generic paywall overlays
  '[class*="paywall" i]',
  '[id*="paywall" i]',
  '[class*="pay-wall" i]',
  '[id*="pay-wall" i]',
  '[class*="subscribe-wall" i]',
  '[class*="metered" i]',
  // regwall handled by login-bypass middleware (has dismiss buttons)
  '[class*="piano-" i]',
  '[id*="piano-" i]',
  // Specific publishers
  '.met-flyout',                         // NYT metered
  '.css-mcm29f',                         // NYT gate
  '#gateway-content',                    // NYT
  '.tp-modal',                           // Piano/Tinypass
  '.tp-backdrop',
  '.tp-iframe-wrapper',
  '#tp-container',
  '.pn-template',
  '.fancybox-overlay',                   // Various
  '.overlay-paywall',
  '.subscriber-only-overlay',
  '.premium-overlay',
  '[data-testid="paywall"]',
  '[data-testid="meter-modal"]',
  // regwall testid handled by login-bypass middleware
  // Medium
  '[class*="meteredContent"]',
  // Washington Post
  '.paywall-overlay',
  '#paywall-modal',
  // Bloomberg
  '.paywall-inline',
  '.fence-body',
  // Generic modals that might be paywalls
  '.reveal-overlay',
  '.ab-iam-root',
];

const ARTICLE_CONTENT_SELECTORS = [
  'article',
  '[role="article"]',
  '.article-body',
  '.article-content',
  '.story-body',
  '.post-content',
  '.entry-content',
  '.main-content',
  '[class*="article-body" i]',
  '[class*="articleBody" i]',
  '[class*="story-body" i]',
  '[class*="storyBody" i]',
  '[class*="post-content" i]',
  '[class*="postContent" i]',
  '[itemprop="articleBody"]',
];

function buildPaywallBypassScript() {
  return `
(function bypassPaywall() {
  const OVERLAY_SEL = ${JSON.stringify(PAYWALL_OVERLAY_SELECTORS)};
  const ARTICLE_SEL = ${JSON.stringify(ARTICLE_CONTENT_SELECTORS)};

  // 1. Remove scroll-lock from html/body
  function unlockScroll() {
    for (const el of [document.documentElement, document.body]) {
      if (!el) continue;
      const style = getComputedStyle(el);
      if (style.overflow === 'hidden' || style.overflowY === 'hidden') {
        el.style.setProperty('overflow', 'auto', 'important');
        el.style.setProperty('overflow-y', 'auto', 'important');
      }
      if (parseInt(style.height) && style.position === 'fixed') {
        el.style.setProperty('position', 'static', 'important');
        el.style.setProperty('height', 'auto', 'important');
      }
    }
  }

  // 2. Remove paywall overlays
  function removeOverlays() {
    let removed = 0;
    for (const sel of OVERLAY_SEL) {
      try {
        for (const el of document.querySelectorAll(sel)) {
          const style = getComputedStyle(el);
          const isOverlay = style.position === 'fixed' || style.position === 'sticky'
            || style.position === 'absolute'
            || style.zIndex > 100;
          if (isOverlay) {
            el.remove();
            removed++;
          }
        }
      } catch {}
    }
    return removed;
  }

  // 3. Unblur / show article content
  function revealContent() {
    for (const sel of ARTICLE_SEL) {
      try {
        for (const el of document.querySelectorAll(sel)) {
          const style = getComputedStyle(el);

          // Remove blur
          if (style.filter && style.filter.includes('blur')) {
            el.style.setProperty('filter', 'none', 'important');
          }

          // Remove clipping / max-height truncation
          if (style.maxHeight && parseInt(style.maxHeight) < 1000) {
            el.style.setProperty('max-height', 'none', 'important');
          }
          if (style.overflow === 'hidden') {
            el.style.setProperty('overflow', 'visible', 'important');
          }

          // Remove gradient fade-out overlays (::after pseudo-elements can't be removed,
          // but we can remove the class or inline the fix)
          el.style.setProperty('-webkit-mask-image', 'none', 'important');
          el.style.setProperty('mask-image', 'none', 'important');
        }
      } catch {}
    }
  }

  // 4. Remove remaining high-z-index fixed overlays
  function removeGenericOverlays() {
    // Skip elements that look like login/auth modals or their backdrops
    const loginPatterns = /login|signin|sign-in|signup|sign-up|auth|modal-backdrop|credential|regwall|reg-wall|registration/i;

    const allFixed = document.querySelectorAll('*');
    for (const el of allFixed) {
      try {
        const style = getComputedStyle(el);
        if (style.position === 'fixed' && parseInt(style.zIndex) > 999) {
          // Skip login/auth-related elements (handled by login-bypass middleware)
          const classAndId = (el.className || '') + ' ' + (el.id || '');
          if (loginPatterns.test(classAndId)) continue;

          // Check if it looks like an overlay (covers significant viewport area)
          const rect = el.getBoundingClientRect();
          const viewportArea = window.innerWidth * window.innerHeight;
          const elArea = rect.width * rect.height;
          if (elArea > viewportArea * 0.3) {
            // Check it's not a header/nav (they're usually narrow)
            if (rect.height > window.innerHeight * 0.3) {
              el.remove();
            }
          }
        }
      } catch {}
    }
  }

  // 5. Show hidden premium content
  function showPremiumContent() {
    const hiddenContent = document.querySelectorAll(
      '[class*="premium-content" i][style*="display: none"], ' +
      '[class*="subscriber-content" i][style*="display: none"], ' +
      '[class*="full-article" i][style*="display: none"], ' +
      '.paywall-content[style*="display: none"]'
    );
    for (const el of hiddenContent) {
      el.style.setProperty('display', 'block', 'important');
    }
  }

  unlockScroll();
  removeOverlays();
  revealContent();
  removeGenericOverlays();
  showPremiumContent();

  // Retry to catch dynamically injected overlays
  setTimeout(() => {
    unlockScroll();
    removeOverlays();
    revealContent();
  }, 1000);

  setTimeout(() => {
    unlockScroll();
    removeOverlays();
    revealContent();
  }, 3000);
})();
`;
}

/**
 * Bypass soft paywalls by removing overlays and restoring content visibility.
 */
export async function bypassPaywall(page) {
  try {
    await page.evaluate(buildPaywallBypassScript());
  } catch {
    // Page might have navigated, silently ignore
  }
}

export function getPaywallBypassInitScript() {
  return `
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { ${buildPaywallBypassScript()} });
    } else {
      ${buildPaywallBypassScript()}
    }
  `;
}
