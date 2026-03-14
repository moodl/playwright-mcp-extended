/**
 * Middleware orchestrator — manages all page-level middleware.
 */

import { dismissCookieConsent, getCookieConsentInitScript } from './cookie-consent.js';

/**
 * Returns combined init script for injection into every page via addInitScript.
 * Each middleware's init script will run on page load automatically.
 */
export function getCombinedInitScript(options = {}) {
  const scripts = [];

  if (options.cookieConsent !== false) {
    scripts.push(getCookieConsentInitScript());
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

  return results;
}

export { dismissCookieConsent };
