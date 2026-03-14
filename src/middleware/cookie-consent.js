/**
 * Cookie consent middleware — automatically detects and dismisses cookie banners.
 *
 * Strategy:
 * 1. Known CMP selectors (fast path) — click accept or remove container
 * 2. Iframe-based CMP removal — nuke containers for cross-origin CMPs
 * 3. Heuristic detection (fallback) — find fixed/modal elements with cookie-related
 *    text or iframes and remove them, then restore scroll
 *
 * Covers: OneTrust, Cookiebot, TrustArc, Quantcast, Didomi, SourcePoint,
 * Complianz, Iubenda, Usercentrics, Klaro, Osano, Termly, CookieYes,
 * Axeptio, Borlabs, CookieFirst, CookieHub, CookieScript, CCM19,
 * Civic Cookie Control, Ezoic, Admiral, and generic cookie dialogs.
 *
 * Approach inspired by:
 * - DuckDuckGo autoconsent (https://github.com/duckduckgo/autoconsent)
 * - Anti-Cookies Consent userscript (Greasyfork)
 * - I Still Don't Care About Cookies (https://github.com/OhMyGuus/I-Still-Dont-Care-About-Cookies)
 */

/** CSS selectors for known CMP banner containers */
const BANNER_SELECTORS = [
  // --- Major CMP platforms ---
  // OneTrust
  '#onetrust-banner-sdk',
  '#onetrust-consent-sdk',
  // Cookiebot
  '#CybotCookiebotDialog',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  // Didomi
  '#didomi-host',
  '#didomi-popup',
  '.didomi-popup-container',
  // Quantcast
  '#qc-cmp2-container',
  '#qc-cmp2-main',
  // TrustArc
  '#truste-consent-track',
  '#truste-consent-content',
  '.truste_box_overlay',
  // SourcePoint
  '[id^="sp_message_container"]',
  // Complianz
  '#cmplz-cookiebanner-container',
  '#cmplz-gloss',
  // Iubenda
  '#iubenda-cs-banner',
  // Usercentrics
  '#usercentrics-root',
  // Klaro
  '.klaro .cookie-modal',
  '.klaro .cookie-notice',
  // Osano
  '.osano-cm-window',
  // Termly
  '.t-consentPrompt',
  // CookieYes
  '.cky-consent-container',
  '#cookie-law-info-bar',
  // Axeptio
  '#axeptio_overlay',
  '#axeptio_btn',
  // Borlabs
  '#BorlabsCookieBox',
  // CookieFirst
  '.cookiefirst-root',
  // CookieHub
  '#cookiehub-frame',
  // CookieScript
  '#cookiescript_injected',
  '#cookiescript_badge',
  // CookieInformation
  '#coiOverlay',
  '#coi-banner-wrapper',
  // CCM19
  '.ccm-root',
  // Civic Cookie Control
  '#ccc-module',
  '#ccc-overlay',
  // Ezoic
  '#ez-cookie-dialog-wrapper',
  // Admiral
  '[id^="admiral-"]',
  // Cookie-Script
  '#cookie-script',
  // Piwik/Matomo
  '#ppms_cm_popup_overlay',
  // Cassie
  '#cassie-widget',
  // Drupal EU Cookie Compliance
  '#sliding-popup',
  // DSGVO (German GDPR plugins)
  '#dsgvoaio',
  // WordPress cookie plugins
  '#cookie-notice',
  '#cookie-law-info-bar',
  '#cookie-law-info-again',

  // Native cookie prompt
  '#cookiePrompt',

  // --- Generic patterns ---
  '#cookiebanner',
  '#cookie-banner',
  '#cookie-consent',
  '#cookie-notice',
  '#gdpr-banner',
  '#gdpr-consent',
  '#privacy-banner',
  '#gdprconsent',
  '#sp-cc',
  '#consent_blackbar',
  '#cookie-bar',
  '#cookie-overlay',
  '#cookieOverlay',
  '#cookie-popup',
  '#cookiePopup',
  '#cookieModal',
  '#cookieBox',
  '#cookieWrapper',
  '#cookie-disclaimer',
  '#eu-cookie-bar',
  '#catapult-cookie-bar',
  '#cookieConsentBar',
  '#privacy-layer-modal',
  '#stickyCookieBar',
  '#cookie-banner-root',
  '#gdpr-consent-tool-wrapper',
  '#cmp-app-container',
  '#gdpr-single-choice-overlay',
  '.cc-banner',
  '.cc-window',
  '.cc-floating',
  '.cookie-banner',
  '.cookie-consent',
  '.cookie-notice',
  '.cookie-popup',
  '.cookie-wall',
  '.cookie-overlay',
  '.consent-banner',
  '.consent-popup',
  '.consent-overlay',
  '.gdpr-banner',
  '.privacy-banner',
  '.privacy-popup',
  '.cookieBanner',
  '.cookieNotice',
  '.cookieBar',
  '.cookieConsent',
  '.cmp__dialog',
  '.cookie-dialog',
  '.cookieconsent-dialog',
  '.js-consent-banner',
  '.js-cookie-banner',
  '[class*="cookie-banner"]',
  '[class*="cookie-consent"]',
  '[class*="cookieConsent"]',
  '[class*="CookieBanner"]',
  '[class*="cookieBanner"]',
  '[id*="cookie-banner"]',
  '[id*="cookie-consent"]',
  '[id*="cookieConsent"]',
  '[data-testid="cookie-banner"]',
  '[data-testid="cookie-consent"]',
  '[data-testid="cookie-policy-dialog"]',
  '[data-module="cookieBanner"]',
  '[data-component="CookieBanner"]',
  '[data-autoload-cookie-consent-bar]',
  '[type="COOKIE-CONSENT"]',
  '[aria-label*="cookie" i]',
  '[aria-label*="consent" i]',
  '[role="dialog"][aria-label*="cookie" i]',
  '[role="dialog"][aria-label*="privacy" i]',
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
  // CookieYes
  '.cky-btn-accept',
  // Site-specific accept button (data-testid)
  'button[data-testid="accept-button"]',
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
  /^accept\s*all\s*cookies?$/i,
  /^accept\s*cookies?$/i,
  /^accept$/i,
  /^agree$/i,
  /^agree\s*(to\s*)?all$/i,
  /^allow\s*all$/i,
  /^allow\s*all\s*cookies?$/i,
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
  /^alles\s*zulassen$/i,
  /^zustimmen$/i,
  /^zustimmen\s+und\s+weiter$/i,
  /^alle\s*zustimmen$/i,
  /^ich\s*stimme\s*zu$/i,
  /^tout\s*accepter$/i,           // French
  /^accepter\s*et\s*continuer$/i,
  /^accepter$/i,
  /^j'accepte$/i,
  /^continuer\s*sans\s*accepter$/i,
  /^aceptar\s*todo$/i,            // Spanish
  /^aceptar$/i,
  /^accetta\s*tutto$/i,           // Italian
  /^accetta$/i,
  /^aceitar\s*tudo$/i,            // Portuguese
  /^aceitar$/i,
  /^alles\s*accepteren$/i,        // Dutch
  /^accepteren$/i,
  /^zaakceptuj\s*wszystko$/i,     // Polish
  /^acceptera\s*alla$/i,          // Swedish
  /^godta\s*alle$/i,              // Norwegian
  /^hyväksy\s*kaikki$/i,          // Finnish
];

/**
 * Build the JavaScript that runs in-page to dismiss cookie banners.
 * Combines selector-based matching with heuristic detection.
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

  function isVisible(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.opacity !== '0'
      && el.offsetWidth > 0
      && el.offsetHeight > 0;
  }

  function restoreScroll() {
    // Force override to 'auto' — clearing inline styles is not enough when
    // the stylesheet itself sets overflow:hidden (common CMP pattern).
    const bodyStyle = getComputedStyle(document.body);
    const htmlStyle = getComputedStyle(document.documentElement);
    if (bodyStyle.overflow === 'hidden' || bodyStyle.overflowY === 'hidden') {
      document.body.style.overflow = 'auto';
    }
    if (htmlStyle.overflow === 'hidden' || htmlStyle.overflowY === 'hidden') {
      document.documentElement.style.overflow = 'auto';
    }
    document.body.style.position = '';
    document.body.classList.remove('sp-message-open', 'didomi-popup-open',
      'qc-cmp-ui-showing', 'cookiewall-active', 'cookie-not-set',
      'cli-barmodal-open', 'cookie_banner_prevent_scroll');
    document.documentElement.classList.remove('sp-message-open',
      'disable--interaction', 'show--consent');
  }

  // --- Strategy 1: Known CMP selectors ---
  function findBanner() {
    for (const sel of BANNER_SEL) {
      try {
        const el = document.querySelector(sel);
        if (el && isVisible(el)) return el;
      } catch {}
    }
    return null;
  }

  function findAcceptButton(root) {
    for (const sel of ACCEPT_BTN_SEL) {
      try {
        const btn = root.querySelector(sel);
        if (btn && isVisible(btn)) return btn;
      } catch {}
    }
    for (const sel of ACCEPT_BTN_SEL) {
      try {
        const btn = document.querySelector(sel);
        if (btn && isVisible(btn)) return btn;
      } catch {}
    }
    const patterns = textPatterns();
    const candidates = root.querySelectorAll('button, a[role="button"], a[href="#"], a[class*="btn"], a[id*="btn"], input[type="button"], input[type="submit"], [role="button"]');
    for (const el of candidates) {
      const text = (el.textContent || el.value || '').trim();
      if (text && patterns.some(p => p.test(text)) && isVisible(el)) return el;
    }
    const allButtons = document.querySelectorAll('button, a[role="button"], [role="button"]');
    for (const el of allButtons) {
      const text = (el.textContent || el.value || '').trim();
      if (text && patterns.some(p => p.test(text)) && isVisible(el)) return el;
    }
    return null;
  }

  // --- Strategy 2: Iframe-based CMP removal ---
  const IFRAME_CMP_SEL = [
    '[id^="sp_message_container"]',
    'div[id^="xsp_message_container"]',
    '#cmplz-cookiebanner-container',
    '#iubenda-cs-banner',
    '#usercentrics-root',
    '[id^="admiral-"]',
    '#cassie-widget',
    '#cookiehub-frame',
    '#ppms_cm_popup_overlay',
  ];

  const CMP_IFRAME_DOMAINS = [
    'privacy-mgmt.com',
    'notice.sp-prod.net',
    'consent-pref.trustarc.com',
    'cdn.iubenda.com',
    'app.usercentrics.eu',
    'cdn.privacy-mgmt.com',
    'cmp.quantcast.com',
    'consent.cookiebot.com',
    'consent.cookiefirst.com',
  ];

  function removeIframeCmps() {
    let removed = false;
    for (const sel of IFRAME_CMP_SEL) {
      try {
        for (const el of document.querySelectorAll(sel)) {
          if (el && el.offsetWidth > 0) {
            el.remove();
            removed = true;
          }
        }
      } catch {}
    }
    for (const iframe of document.querySelectorAll('iframe')) {
      try {
        if (CMP_IFRAME_DOMAINS.some(d => iframe.src.includes(d)) && iframe.offsetWidth > 0) {
          const parent = iframe.closest(
            '[id^="sp_message"], [class*="consent"], [class*="cookie"], [role="dialog"], [class*="cmp"]'
          ) || iframe;
          parent.remove();
          removed = true;
        }
      } catch {}
    }
    if (removed) restoreScroll();
    return removed;
  }

  // --- Strategy 3: Heuristic detection ---
  const COOKIE_TEXT_PATTERN = /cookie|consent|gdpr|privacy|datenschutz|rgpd|privacidad|dsgvo/i;

  function isFixed(el) {
    const style = getComputedStyle(el);
    return style.position === 'fixed' || style.position === 'sticky';
  }

  function isFullWidth(el) {
    return el.offsetWidth > window.innerWidth * 0.5;
  }

  function isOverlayLike(el) {
    const style = getComputedStyle(el);
    const z = parseInt(style.zIndex);
    return !isNaN(z) && z > 999 && (
      style.position === 'fixed' || style.position === 'absolute'
    );
  }

  function heuristicRemoval() {
    let removed = false;
    for (const el of document.querySelectorAll('div, section, aside, [role="dialog"], [role="alertdialog"]')) {
      if (!isVisible(el)) continue;
      // Skip elements that are clearly main content (have links, code, articles inside)
      if (el.querySelector('main, article, pre, code, [role="main"]')) continue;
      const hasIframe = el.querySelector('iframe');
      const textMatch = COOKIE_TEXT_PATTERN.test(el.textContent);
      if (!textMatch && !hasIframe) continue;
      if ((isFixed(el) || isOverlayLike(el)) && isFullWidth(el)) {
        const contentLen = el.textContent.length;
        // Only remove small overlays — real content is much larger
        if (contentLen < 3000) {
          el.remove();
          removed = true;
        }
      }
    }
    if (removed) restoreScroll();
    return removed;
  }

  // --- Main dismiss logic ---
  function tryDismiss() {
    // Strategy 1: Remove iframe-based CMPs
    const iframeRemoved = removeIframeCmps();

    // Strategy 2: Click accept on known banners
    const banner = findBanner();
    if (banner) {
      const acceptBtn = findAcceptButton(banner);
      if (acceptBtn) {
        acceptBtn.click();
        restoreScroll();
        return true;
      }
      const closeBtn = banner.querySelector(
        'button[aria-label*="close" i], button[aria-label*="dismiss" i], ' +
        'button.close, .close-button, [data-dismiss], ' +
        'button[class*="close" i], button[class*="dismiss" i]'
      );
      if (closeBtn && isVisible(closeBtn)) {
        closeBtn.click();
        restoreScroll();
        return true;
      }
      // No button found — just remove the banner
      banner.remove();
      restoreScroll();
      return true;
    }

    if (iframeRemoved) return true;

    // Strategy 3: Heuristic fallback for overlays
    if (heuristicRemoval()) return true;

    // Strategy 4: Consent wall — entire page is a consent form (no banner, just a full-page gate)
    // Scan document for accept buttons even without a detected banner
    if (COOKIE_TEXT_PATTERN.test(document.body.textContent)) {
      const patterns = textPatterns();
      const allClickable = document.querySelectorAll('button, a[role="button"], a[href], a[class*="btn"], a[id*="btn"], input[type="button"], input[type="submit"], [role="button"]');
      for (const el of allClickable) {
        const text = (el.textContent || el.value || '').trim();
        if (text && patterns.some(p => p.test(text)) && isVisible(el)) {
          el.click();
          return true;
        }
      }
    }

    // Strategy 5: Consent wall redirect — page URL contains consent/zustimmung path
    // with a "from" parameter pointing to the original URL. Navigate back directly.
    try {
      const url = new URL(window.location.href);
      const path = url.pathname.toLowerCase();
      const isConsentPath = /consent|zustimmung|cookie-wall|cookie-gate|privacy-gate|gdpr/i.test(path);
      const from = url.searchParams.get('from') || url.searchParams.get('redirect') || url.searchParams.get('return') || url.searchParams.get('returnUrl') || url.searchParams.get('redirect_uri') || url.searchParams.get('continue');
      if (isConsentPath && from) {
        try {
          const target = new URL(from);
          if (target.origin === url.origin) {
            window.location.href = from;
            return true;
          }
        } catch {}
      }
    } catch {}

    return false;
  }

  // Run immediately
  tryDismiss();

  // Retry after short delays to catch late-appearing banners
  setTimeout(tryDismiss, 500);
  setTimeout(tryDismiss, 1500);
  setTimeout(tryDismiss, 3000);

  // Watch for dynamically injected banners via MutationObserver
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        const tag = node.tagName;
        if (tag === 'DIV' || tag === 'SECTION' || tag === 'ASIDE' || tag === 'IFRAME') {
          tryDismiss();
          return;
        }
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Auto-disconnect observer after 10s to avoid perf impact
  setTimeout(() => observer.disconnect(), 10000);
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
