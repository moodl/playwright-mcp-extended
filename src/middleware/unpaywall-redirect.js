/**
 * Unpaywall redirect middleware — automatically redirects paywalled URLs
 * to their unpaywalled equivalents via free proxy services.
 *
 * Supported redirect strategies:
 * - Medium / Towards Data Science articles -> freedium.cfd
 * - Major news paywalls (NYT, WSJ, Bloomberg, etc.) -> archive.ph
 * - General fallback -> 12ft.io
 *
 * Only redirects article pages (URL path with more than 1 segment),
 * leaving homepages and section pages untouched.
 */

/**
 * @typedef {'freedium' | 'archive' | '12ft'} RedirectService
 */

/**
 * @typedef {Object} UnpaywallRedirectOptions
 * @property {boolean} [enabled=true] - Whether the redirect middleware is active.
 * @property {RedirectService} [preferredService] - Override the default service
 *   selection ('freedium' for Medium domains, 'archive' for news sites).
 * @property {string[]} [redirectDomains] - Additional domains to redirect
 *   (uses 12ft.io by default, or preferredService if set).
 */

/** Domains that should redirect through freedium.cfd. */
const FREEDIUM_DOMAINS = [
  'medium.com',
  'towardsdatascience.com',
];

/** Domains that should redirect through archive.ph. */
const ARCHIVE_DOMAINS = [
  'bloomberg.com',
  'wsj.com',
  'nytimes.com',
  'washingtonpost.com',
  'ft.com',
  'economist.com',
  'theathletic.com',
];

/**
 * Checks whether a URL path looks like an article page rather than a homepage
 * or section landing page. An article page has more than 1 meaningful path segment.
 *
 * @param {string} pathname - The URL pathname (e.g. "/2024/03/my-article").
 * @returns {boolean} True if the path has more than 1 segment.
 */
function isArticlePage(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  return segments.length > 1;
}

/**
 * Extracts the effective domain from a hostname, handling subdomains.
 * For example, "blog.medium.com" matches against "medium.com".
 *
 * @param {string} hostname - The full hostname.
 * @param {string[]} domainList - List of base domains to match against.
 * @returns {string | null} The matched base domain, or null.
 */
function matchDomain(hostname, domainList) {
  const lower = hostname.toLowerCase();
  for (const domain of domainList) {
    if (lower === domain || lower.endsWith('.' + domain)) {
      return domain;
    }
  }
  return null;
}

/**
 * Builds a freedium.cfd redirect URL for a given source URL.
 *
 * @param {string} originalUrl - The original paywalled URL.
 * @returns {string} The freedium redirect URL.
 */
function buildFreediumUrl(originalUrl) {
  const parsed = new URL(originalUrl);
  return `https://freedium.cfd/${parsed.href}`;
}

/**
 * Builds an archive.ph redirect URL for a given source URL.
 *
 * @param {string} originalUrl - The original paywalled URL.
 * @returns {string} The archive.ph redirect URL.
 */
function buildArchiveUrl(originalUrl) {
  return `https://archive.ph/${originalUrl}`;
}

/**
 * Builds a 12ft.io redirect URL for a given source URL.
 *
 * @param {string} originalUrl - The original paywalled URL.
 * @returns {string} The 12ft.io redirect URL.
 */
function build12ftUrl(originalUrl) {
  return `https://12ft.io/${originalUrl}`;
}

/**
 * Returns the best unpaywalled URL for a given paywalled URL, or null
 * if the URL is not recognized as a paywalled site or is not an article page.
 *
 * @param {string} url - The URL to check.
 * @param {UnpaywallRedirectOptions} [options={}] - Redirect options.
 * @returns {string | null} The unpaywalled redirect URL, or null.
 */
export function getUnpaywalledUrl(url, options = {}) {
  if (options.enabled === false) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!isArticlePage(parsed.pathname)) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  const { preferredService, redirectDomains = [] } = options;

  // Check freedium domains (Medium family)
  if (matchDomain(hostname, FREEDIUM_DOMAINS)) {
    if (preferredService === 'archive') return buildArchiveUrl(url);
    if (preferredService === '12ft') return build12ftUrl(url);
    return buildFreediumUrl(url);
  }

  // Check archive domains (major news paywalls)
  if (matchDomain(hostname, ARCHIVE_DOMAINS)) {
    if (preferredService === 'freedium') return buildFreediumUrl(url);
    if (preferredService === '12ft') return build12ftUrl(url);
    return buildArchiveUrl(url);
  }

  // Check user-supplied additional domains
  if (matchDomain(hostname, redirectDomains)) {
    if (preferredService === 'freedium') return buildFreediumUrl(url);
    if (preferredService === 'archive') return buildArchiveUrl(url);
    return build12ftUrl(url);
  }

  return null;
}

/**
 * Builds the client-side init script that intercepts navigation and
 * redirects paywalled URLs to their unpaywalled equivalents.
 *
 * @param {UnpaywallRedirectOptions} [options={}] - Redirect options.
 * @returns {string} JavaScript source to inject via addInitScript.
 */
function buildRedirectInitScript(options = {}) {
  const freediumDomains = JSON.stringify(FREEDIUM_DOMAINS);
  const archiveDomains = JSON.stringify(ARCHIVE_DOMAINS);
  const extraDomains = JSON.stringify(options.redirectDomains || []);
  const preferredService = JSON.stringify(options.preferredService || null);

  return `
(function unpaywallRedirect() {
  const FREEDIUM_DOMAINS = ${freediumDomains};
  const ARCHIVE_DOMAINS = ${archiveDomains};
  const EXTRA_DOMAINS = ${extraDomains};
  const PREFERRED = ${preferredService};

  function isArticlePage(pathname) {
    var segments = pathname.split('/').filter(Boolean);
    return segments.length > 1;
  }

  function matchDomain(hostname, domainList) {
    var lower = hostname.toLowerCase();
    for (var i = 0; i < domainList.length; i++) {
      if (lower === domainList[i] || lower.endsWith('.' + domainList[i])) {
        return domainList[i];
      }
    }
    return null;
  }

  function buildFreediumUrl(url) { return 'https://freedium.cfd/' + url; }
  function buildArchiveUrl(url) { return 'https://archive.ph/' + url; }
  function build12ftUrl(url) { return 'https://12ft.io/' + url; }

  function getRedirectUrl(url) {
    var hostname = location.hostname.toLowerCase();
    if (!isArticlePage(location.pathname)) return null;

    if (matchDomain(hostname, FREEDIUM_DOMAINS)) {
      if (PREFERRED === 'archive') return buildArchiveUrl(url);
      if (PREFERRED === '12ft') return build12ftUrl(url);
      return buildFreediumUrl(url);
    }
    if (matchDomain(hostname, ARCHIVE_DOMAINS)) {
      if (PREFERRED === 'freedium') return buildFreediumUrl(url);
      if (PREFERRED === '12ft') return build12ftUrl(url);
      return buildArchiveUrl(url);
    }
    if (matchDomain(hostname, EXTRA_DOMAINS)) {
      if (PREFERRED === 'freedium') return buildFreediumUrl(url);
      if (PREFERRED === 'archive') return buildArchiveUrl(url);
      return build12ftUrl(url);
    }
    return null;
  }

  var currentUrl = location.href;
  var redirectUrl = getRedirectUrl(currentUrl);
  if (redirectUrl) {
    window.location.href = redirectUrl;
  }
})();
`;
}

/**
 * Returns the JavaScript init script for unpaywall redirection,
 * suitable for injection via page.addInitScript().
 *
 * @param {UnpaywallRedirectOptions} [options={}] - Redirect options.
 * @returns {string} JavaScript source that runs on every page load.
 */
export function getUnpaywalledRedirectInitScript(options = {}) {
  if (options.enabled === false) {
    return '';
  }

  const script = buildRedirectInitScript(options);

  return `
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { ${script} });
    } else {
      ${script}
    }
  `;
}
