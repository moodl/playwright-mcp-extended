/**
 * Cookie consent middleware — automatically detects and dismisses cookie banners.
 *
 * Strategy:
 * 1. Inject a script that runs on every page load via addInitScript
 * 2. After navigation, run a cleanup pass to catch banners that appeared late
 *
 * Covers: CMP platforms (OneTrust, Cookiebot, TrustArc, Quantcast, Didomi, etc.),
 * GDPR/CCPA banners, and generic cookie dialogs.
 */

/** CSS selectors for common cookie consent banners and their accept/dismiss buttons */
const BANNER_SELECTORS = [
  // --- CMP platforms ---
  '#onetrust-banner-sdk',
  '#onetrust-consent-sdk',
  '#CybotCookiebotDialog',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#cookiebanner',
  '#cookie-banner',
  '#cookie-consent',
  '#cookie-notice',
  '#gdpr-banner',
  '#gdpr-consent',
  '#privacy-banner',
  '.cc-banner',
  '.cc-window',
  '.cookie-banner',
  '.cookie-consent',
  '.cookie-notice',
  '.cookie-popup',
  '.cookie-wall',
  '.cookie-overlay',
  '.consent-banner',
  '.consent-popup',
  '.gdpr-banner',
  '.privacy-banner',
  '.privacy-popup',
  '[class*="cookie-banner"]',
  '[class*="cookie-consent"]',
  '[class*="cookieConsent"]',
  '[class*="CookieBanner"]',
  '[class*="gdpr"]',
  '[id*="cookie-banner"]',
  '[id*="cookie-consent"]',
  '[id*="cookieConsent"]',
  '[id*="gdpr"]',
  '[data-testid="cookie-banner"]',
  '[data-testid="cookie-consent"]',
  '[aria-label*="cookie"]',
  '[aria-label*="Cookie"]',
  '[aria-label*="consent"]',
  '[role="dialog"][aria-label*="cookie" i]',
  '[role="dialog"][aria-label*="privacy" i]',
  // Didomi
  '#didomi-host',
  '#didomi-popup',
  '.didomi-popup-container',
  // Quantcast
  '#qc-cmp2-container',
  '.qc-cmp2-summary-buttons',
  // TrustArc
  '#truste-consent-track',
  '#truste-consent-content',
  '.truste_box_overlay',
  // Klaro
  '.klaro .cookie-modal',
  '.klaro .cookie-notice',
  // Osano
  '.osano-cm-window',
  // Termly
  '.t-consentPrompt',
];

/** Selectors for "accept all" / "agree" / "OK" buttons within banners */
const ACCEPT_BUTTON_SELECTORS = [
  // OneTrust
  '#onetrust-accept-btn-handler',
  '#accept-recommended-btn-handler',
  // Cookiebot
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  'a#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  // Didomi
  '#didomi-notice-agree-button',
  '.didomi-continue-without-agreeing',
  // Quantcast
  '[class*="qc-cmp2"] button[mode="primary"]',
  // Klaro
  '.klaro .cm-btn-accept',
  '.klaro .cm-btn-accept-all',
  // Osano
  '.osano-cm-accept-all',
  // Termly
  '.t-acceptAllButton',
  // Generic patterns — order matters: prefer "accept all" over just "accept"
  'button[id*="accept-all" i]',
  'button[id*="acceptAll" i]',
  'button[id*="accept_all" i]',
  'button[class*="accept-all" i]',
  'button[class*="acceptAll" i]',
  'a[id*="accept-all" i]',
  'a[class*="accept-all" i]',
  'button[id*="cookie-accept" i]',
  'button[id*="cookieAccept" i]',
  'button[class*="cookie-accept" i]',
  'button[id*="consent-accept" i]',
  'button[class*="consent-accept" i]',
  'button[data-action="accept"]',
  'button[data-consent="accept"]',
  'button[aria-label*="accept all" i]',
  'button[aria-label*="Accept All" i]',
  'button[aria-label*="agree" i]',
  'button[title*="accept" i]',
];

/** Text patterns for accept buttons (matched case-insensitively) */
const ACCEPT_TEXT_PATTERNS = [
  /^accept\s*all$/i,
  /^accept\s*cookies?$/i,
  /^accept$/i,
  /^agree$/i,
  /^agree\s*(to\s*)?all$/i,
  /^allow\s*all$/i,
  /^allow\s*cookies?$/i,
  /^got\s*it$/i,
  /^ok$/i,
  /^okay$/i,
  /^i\s*agree$/i,
  /^i\s*accept$/i,
  /^i\s*understand$/i,
  /^continue$/i,
  /^yes,?\s*i\s*agree$/i,
  /^consent$/i,
  /^close$/i,
  /^dismiss$/i,
  /^alle\s*akzeptieren$/i,        // German
  /^akzeptieren$/i,
  /^tout\s*accepter$/i,           // French
  /^accepter$/i,
  /^aceptar\s*todo$/i,            // Spanish
  /^aceptar$/i,
  /^accetta\s*tutto$/i,           // Italian
  /^accetta$/i,
  /^aceitar\s*tudo$/i,            // Portuguese
  /^aceitar$/i,
  /^alles\s*accepteren$/i,        // Dutch
  /^accepteren$/i,
];

/**
 * Build the JavaScript that runs in-page to dismiss cookie banners.
 * This is injected via page.evaluate() and also via addInitScript().
 */
function buildDismissScript() {
  return `
(function dismissCookieBanners() {
  const BANNER_SEL = ${JSON.stringify(BANNER_SELECTORS)};
  const ACCEPT_BTN_SEL = ${JSON.stringify(ACCEPT_BUTTON_SELECTORS)};
  const ACCEPT_TEXT = ${JSON.stringify(ACCEPT_TEXT_PATTERNS.map(r => r.source))};
  const ACCEPT_FLAGS = ${JSON.stringify(ACCEPT_TEXT_PATTERNS.map(r => r.flags))};

  function textPatterns() {
    return ACCEPT_TEXT.map((src, i) => new RegExp(src, ACCEPT_FLAGS[i]));
  }

  function findBanner() {
    for (const sel of BANNER_SEL) {
      try {
        const el = document.querySelector(sel);
        if (el && isVisible(el)) return el;
      } catch {}
    }
    return null;
  }

  function isVisible(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.opacity !== '0'
      && el.offsetWidth > 0
      && el.offsetHeight > 0;
  }

  function findAcceptButton(root) {
    // 1. Try specific selectors within the banner
    for (const sel of ACCEPT_BTN_SEL) {
      try {
        const btn = root.querySelector(sel);
        if (btn && isVisible(btn)) return btn;
      } catch {}
    }

    // 2. Try specific selectors at document level
    for (const sel of ACCEPT_BTN_SEL) {
      try {
        const btn = document.querySelector(sel);
        if (btn && isVisible(btn)) return btn;
      } catch {}
    }

    // 3. Text-based search within the banner
    const patterns = textPatterns();
    const candidates = root.querySelectorAll('button, a[role="button"], a[href="#"], input[type="button"], input[type="submit"], [role="button"]');
    for (const el of candidates) {
      const text = (el.textContent || el.value || '').trim();
      if (text && patterns.some(p => p.test(text)) && isVisible(el)) return el;
    }

    // 4. Text-based search at document level (for banners with buttons outside container)
    const allButtons = document.querySelectorAll('button, a[role="button"], [role="button"]');
    for (const el of allButtons) {
      const text = (el.textContent || el.value || '').trim();
      if (text && patterns.some(p => p.test(text)) && isVisible(el)) return el;
    }

    return null;
  }

  function tryDismiss() {
    const banner = findBanner();
    if (!banner) return false;

    const acceptBtn = findAcceptButton(banner);
    if (acceptBtn) {
      acceptBtn.click();
      return true;
    }

    // Fallback: look for a close/X button
    const closeBtn = banner.querySelector(
      'button[aria-label*="close" i], button[aria-label*="dismiss" i], ' +
      'button.close, .close-button, [data-dismiss], ' +
      'button[class*="close" i], button[class*="dismiss" i]'
    );
    if (closeBtn && isVisible(closeBtn)) {
      closeBtn.click();
      return true;
    }

    return false;
  }

  // Run immediately
  tryDismiss();

  // Retry after short delays to catch late-appearing banners
  setTimeout(tryDismiss, 500);
  setTimeout(tryDismiss, 1500);
  setTimeout(tryDismiss, 3000);
})();
`;
}

/**
 * Middleware that dismisses cookie consent banners.
 * Called after page navigation completes.
 */
export async function dismissCookieConsent(page) {
  try {
    await page.evaluate(buildDismissScript());
  } catch {
    // Page might have navigated away, that's fine
  }
}

/**
 * Init script version — injected into every page via addInitScript.
 * Runs on DOMContentLoaded automatically.
 */
export function getCookieConsentInitScript() {
  return `
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { ${buildDismissScript()} });
    } else {
      ${buildDismissScript()}
    }
  `;
}

export const COOKIE_BANNER_SELECTORS = BANNER_SELECTORS;
export const COOKIE_ACCEPT_SELECTORS = ACCEPT_BUTTON_SELECTORS;
