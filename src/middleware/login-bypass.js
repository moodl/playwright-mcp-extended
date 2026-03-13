/**
 * Login screen / registration wall bypass middleware.
 *
 * Strategies:
 * 1. Detect and dismiss login/signup modals (not the actual login page)
 * 2. Remove registration walls that block content
 * 3. Close "sign up to continue" interstitials
 * 4. Detect Google One-Tap and similar auth popups
 *
 * Note: This does NOT perform actual authentication. It dismisses
 * modals/overlays that obstruct content behind a "sign up" or "log in" prompt.
 */

const LOGIN_MODAL_SELECTORS = [
  // Generic login/signup modals
  '[class*="login-modal" i]',
  '[class*="loginModal" i]',
  '[class*="signin-modal" i]',
  '[class*="signInModal" i]',
  '[class*="signup-modal" i]',
  '[class*="signupModal" i]',
  '[class*="sign-up-modal" i]',
  '[class*="register-modal" i]',
  '[class*="registerModal" i]',
  '[class*="auth-modal" i]',
  '[class*="authModal" i]',
  '[id*="login-modal" i]',
  '[id*="loginModal" i]',
  '[id*="signin-modal" i]',
  '[id*="signup-modal" i]',
  '[id*="register-modal" i]',
  '[id*="auth-modal" i]',
  '[data-testid*="login-modal" i]',
  '[data-testid*="signup-modal" i]',
  '[data-testid*="auth-modal" i]',
  // Registration walls
  '[class*="regwall" i]',
  '[class*="reg-wall" i]',
  '[id*="regwall" i]',
  '[id*="reg-wall" i]',
  '[class*="registration-wall" i]',
  // Google One-Tap
  '#credential_picker_container',
  '#credential_picker_iframe',
  '[id*="google-one-tap" i]',
  '.google-one-tap',
  // Facebook login popup
  '.fb-login-popup',
  '[class*="fb-login" i]',
  // Apple sign-in overlay
  '[id*="appleid-signin" i]',
  // Generic "continue with" overlays
  '[class*="social-login-modal" i]',
  '[class*="social-auth" i]',
  // Email gate / newsletter gate
  '[class*="email-gate" i]',
  '[class*="emailGate" i]',
  '[class*="newsletter-gate" i]',
  '[class*="newsletterGate" i]',
  '[class*="email-wall" i]',
  '[class*="email-modal" i]',
  // Interstitials
  '[class*="interstitial" i]',
  '[id*="interstitial" i]',
];

const CLOSE_BUTTON_SELECTORS = [
  'button[aria-label*="close" i]',
  'button[aria-label*="dismiss" i]',
  'button[aria-label*="Close" i]',
  'button.close',
  'button.modal-close',
  '.close-button',
  '.close-btn',
  '.modal-close-btn',
  '[data-dismiss="modal"]',
  '[data-action="close"]',
  'button[class*="close" i]',
  'button[class*="dismiss" i]',
  'a[class*="close" i]',
  // X button patterns
  'button svg', // many close buttons use an SVG icon
];

const SKIP_TEXT_PATTERNS = [
  /^no\s*thanks?$/i,
  /^skip$/i,
  /^not\s*now$/i,
  /^maybe\s*later$/i,
  /^later$/i,
  /^close$/i,
  /^dismiss$/i,
  /^continue\s*(reading|browsing|without)?$/i,
  /^no,?\s*thanks?$/i,
  /^i('?ll)?\s*do\s*(it|this)\s*later$/i,
  /^nein\s*danke$/i,            // German
  /^non\s*merci$/i,             // French
  /^no\s*gracias$/i,            // Spanish
  /^nicht\s*jetzt$/i,           // German
  /^pas\s*maintenant$/i,        // French
];

function buildLoginBypassScript() {
  return `
(function bypassLoginScreens() {
  const MODAL_SEL = ${JSON.stringify(LOGIN_MODAL_SELECTORS)};
  const CLOSE_SEL = ${JSON.stringify(CLOSE_BUTTON_SELECTORS)};
  const SKIP_TEXT = ${JSON.stringify(SKIP_TEXT_PATTERNS.map(r => r.source))};
  const SKIP_FLAGS = ${JSON.stringify(SKIP_TEXT_PATTERNS.map(r => r.flags))};

  function skipPatterns() {
    return SKIP_TEXT.map((src, i) => new RegExp(src, SKIP_FLAGS[i]));
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

  function findAndDismissModals() {
    let dismissed = 0;

    for (const sel of MODAL_SEL) {
      try {
        for (const modal of document.querySelectorAll(sel)) {
          if (!isVisible(modal)) continue;

          // Try close/dismiss button inside the modal
          let closed = false;
          for (const closeSel of CLOSE_SEL) {
            try {
              const btn = modal.querySelector(closeSel);
              if (btn && isVisible(btn)) {
                btn.click();
                closed = true;
                dismissed++;
                break;
              }
            } catch {}
          }

          if (closed) continue;

          // Try "skip" / "not now" / "later" links/buttons
          const patterns = skipPatterns();
          const candidates = modal.querySelectorAll('button, a, span, div, p, [role="button"], [role="link"]');
          for (const el of candidates) {
            const text = (el.textContent || '').trim();
            if (text && patterns.some(p => p.test(text)) && isVisible(el)) {
              el.click();
              closed = true;
              dismissed++;
              break;
            }
          }

          if (closed) continue;

          // Last resort: if it's a fixed/absolute overlay, remove it
          const style = getComputedStyle(modal);
          if (style.position === 'fixed' || style.position === 'absolute') {
            const rect = modal.getBoundingClientRect();
            const viewportArea = window.innerWidth * window.innerHeight;
            if (rect.width * rect.height > viewportArea * 0.2) {
              modal.remove();
              dismissed++;
            }
          }
        }
      } catch {}
    }

    // Only remove backdrops if no button-based dismissal succeeded
    // (button clicks let the page's own JS handle backdrop cleanup)
    if (dismissed === 0) {
      const backdropSelectors = [
        '.modal-backdrop',
        '.overlay',
        '[class*="backdrop" i]',
        '[class*="modal-overlay" i]',
      ];
      for (const sel of backdropSelectors) {
        try {
          for (const el of document.querySelectorAll(sel)) {
            const style = getComputedStyle(el);
            if ((style.position === 'fixed' || style.position === 'absolute') && parseInt(style.zIndex) > 100) {
              el.remove();
              dismissed++;
            }
          }
        } catch {}
      }
    }

    // Unlock scroll after any dismissal
    if (dismissed > 0) {
      for (const el of [document.documentElement, document.body]) {
        if (!el) continue;
        const style = getComputedStyle(el);
        if (style.overflow === 'hidden' || style.overflowY === 'hidden') {
          el.style.setProperty('overflow', 'auto', 'important');
          el.style.setProperty('overflow-y', 'auto', 'important');
        }
      }
    }

    return dismissed;
  }

  // Remove Google One-Tap specifically
  function removeGoogleOneTap() {
    const oneTap = document.querySelector('#credential_picker_container');
    if (oneTap) oneTap.remove();
    // Also remove the iframe version
    const iframes = document.querySelectorAll('iframe[src*="accounts.google.com/gsi"]');
    for (const iframe of iframes) {
      const parent = iframe.parentElement;
      if (parent && parent.style.position === 'fixed') {
        parent.remove();
      }
    }
  }

  findAndDismissModals();
  removeGoogleOneTap();

  setTimeout(() => {
    findAndDismissModals();
    removeGoogleOneTap();
  }, 1000);

  setTimeout(() => {
    findAndDismissModals();
    removeGoogleOneTap();
  }, 3000);
})();
`;
}

export async function bypassLoginScreens(page) {
  try {
    await page.evaluate(buildLoginBypassScript());
  } catch {
    // Silently ignore
  }
}

export function getLoginBypassInitScript() {
  return `
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { ${buildLoginBypassScript()} });
    } else {
      ${buildLoginBypassScript()}
    }
  `;
}
