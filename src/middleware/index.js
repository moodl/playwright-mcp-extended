/**
 * Middleware orchestrator — manages all page-level middleware.
 */

import { dismissCookieConsent, getCookieConsentInitScript } from './cookie-consent.js';
import { bypassPaywall, getPaywallBypassInitScript } from './paywall-bypass.js';
import { bypassLoginScreens, getLoginBypassInitScript } from './login-bypass.js';

/**
 * Returns combined init script for injection into every page via addInitScript.
 * Each middleware's init script will run on page load automatically.
 */
export function getCombinedInitScript(options = {}) {
  const scripts = [];

  if (options.cookieConsent !== false) {
    scripts.push(getCookieConsentInitScript());
  }
  if (options.paywallBypass !== false) {
    scripts.push(getPaywallBypassInitScript());
  }
  if (options.loginBypass !== false) {
    scripts.push(getLoginBypassInitScript());
  }

  return scripts.join('\n');
}

/**
 * Run all middleware on a page (post-navigation).
 * Returns a summary of what was done.
 */
export async function runAllMiddleware(page, options = {}) {
  const results = [];

  if (options.cookieConsent !== false) {
    await dismissCookieConsent(page);
    results.push('cookie-consent');
  }
  if (options.paywallBypass !== false) {
    await bypassPaywall(page);
    results.push('paywall-bypass');
  }
  if (options.loginBypass !== false) {
    await bypassLoginScreens(page);
    results.push('login-bypass');
  }

  return results;
}

export { dismissCookieConsent, bypassPaywall, bypassLoginScreens };
