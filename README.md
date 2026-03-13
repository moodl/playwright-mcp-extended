# Playwright MCP Extended

[![Integration Tests](https://github.com/moodl/playwright-mcp-extended/actions/workflows/test.yml/badge.svg)](https://github.com/moodl/playwright-mcp-extended/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A drop-in wrapper around Microsoft's [@playwright/mcp](https://github.com/microsoft/playwright-mcp) that automatically handles cookie consent banners, soft paywalls, login/signup modals, and redirects to unpaywalled article mirrors.

> **Note:** This is an independent community project. It is **not** a fork of the Playwright MCP source code and is **not affiliated with or endorsed by Microsoft** or the Playwright team. It uses `@playwright/mcp` as a runtime dependency under the [Apache License 2.0](LICENSES/Apache-2.0.txt). See [NOTICE](NOTICE) for full attribution.

---

## Features

| Middleware | What it does |
|---|---|
| **Cookie Consent** | Detects and auto-dismisses cookie banners from 60+ CMP platforms (OneTrust, Cookiebot, Didomi, Quantcast, TrustArc, and more). Supports 8 languages. |
| **Paywall Bypass** | Removes soft-paywall overlays, unlocks scroll, unblurs article content, expands truncated containers. Works on Piano/Tinypass, and generic paywall patterns. |
| **Login/Signup Bypass** | Dismisses login modals, registration walls, email gates, Google One-Tap prompts, and "sign up to continue" interstitials. |
| **Unpaywall Redirect** | Auto-redirects paywalled article URLs to free mirrors: [freedium.cfd](https://freedium.cfd) for Medium, [archive.ph](https://archive.ph) for major news sites, [12ft.io](https://12ft.io) as fallback. |

All middleware runs via Playwright's `addInitScript` mechanism — it injects JavaScript into every page before any site scripts execute, with automatic retries at 500ms, 1.5s, and 3s to catch late-appearing elements.

---

## Quick Start

### As a Claude Code MCP Server

Add to your MCP configuration (e.g., `~/.claude/plugins` or project `.mcp.json`):

```json
{
  "playwright-extended": {
    "command": "node",
    "args": ["/path/to/playwright-mcp-extended/src/cli.js"]
  }
}
```

### CLI (drop-in replacement for `npx @playwright/mcp`)

```bash
# All middleware enabled (default)
node src/cli.js

# With original Playwright MCP flags
node src/cli.js --headless --browser chrome

# Disable specific middleware
node src/cli.js --no-cookie-consent
node src/cli.js --no-paywall-bypass
node src/cli.js --no-login-bypass
node src/cli.js --no-unpaywall-redirect

# Choose preferred redirect service
node src/cli.js --redirect-service archive    # freedium | archive | 12ft
```

All original `@playwright/mcp` CLI options are fully supported and passed through.

### Programmatic API

```js
import { createConnection } from './src/index.js';

const server = await createConnection(
  { browser: { headless: true } },  // Playwright MCP config
  {
    cookieConsent: true,              // default: true
    paywallBypass: true,              // default: true
    loginBypass: true,                // default: true
    unpaywallRedirect: true,          // default: true
  }
);
```

---

## How It Works

```
Client (Claude, etc.)
  │
  ▼
playwright-mcp-extended CLI
  │  Writes combined init script to temp file
  │  Passes --init-script to @playwright/mcp
  ▼
@playwright/mcp (unmodified)
  │  Injects init script into every browser page
  ▼
Browser Page
  │  1. Unpaywall redirect (navigates away if paywalled article)
  │  2. Cookie consent auto-dismiss
  │  3. Paywall overlay removal + content reveal
  │  4. Login/signup modal dismissal
  ▼
Clean, readable page returned to client
```

No source code from Playwright or Playwright MCP is modified. This project only adds an init script layer on top.

---

## Unpaywall Redirect Domains

| Domain | Redirects to |
|---|---|
| `medium.com`, `*.medium.com`, `towardsdatascience.com` | freedium.cfd |
| `nytimes.com`, `wsj.com`, `bloomberg.com` | archive.ph |
| `washingtonpost.com`, `ft.com`, `economist.com` | archive.ph |
| `theathletic.com` | archive.ph |
| Custom domains (via `--redirect-service`) | 12ft.io (default) |

Only article pages are redirected (URLs with more than 1 path segment). Homepages and section pages are left untouched.

---

## Testing

### Fixture Tests (deterministic)

Local HTML pages simulating real-world cookie banners, paywalls, and login modals:

```bash
npm test
```

### Real-World Tests (smoke tests against live websites)

Tests against BBC, Reuters, StackOverflow, golem.de, NYT, Medium, Quora, and Pinterest:

```bash
npm run test:real
```

### Docker

```bash
npm run test:docker
```

### All Tests

```bash
npm run test:all
```

---

## CI/CD

GitHub Actions runs on every push and PR:

| Job | Description | Required |
|---|---|---|
| **Fixture Tests** | 9 deterministic tests against local HTML fixtures | Yes |
| **Real-world Tests** | 9 smoke tests against live websites | No (allowed to fail) |
| **Docker Tests** | Full test suite in a containerized environment | Yes |

---

## Project Structure

```
src/
  cli.js                         # CLI entry point (drop-in replacement)
  index.js                       # Programmatic API
  middleware/
    index.js                     # Middleware orchestrator
    cookie-consent.js            # Cookie banner detection & dismissal
    paywall-bypass.js            # Soft paywall overlay removal
    login-bypass.js              # Login/signup modal dismissal
    unpaywall-redirect.js        # URL redirect to free mirrors
test/
  integration.test.js            # Fixture-based tests
  real-world.test.js             # Live website tests
  server.js                      # Local test HTTP server
  fixtures/                      # HTML test pages
```

---

## Disclaimer

> **This software is provided "as is" without any warranty. The authors assume no liability for any damages or legal consequences arising from its use. See [DISCLAIMER.md](DISCLAIMER.md) for full details.**

This project is intended for **personal and educational use**. Users are responsible for complying with all applicable laws and terms of service. Some websites use paywalls to fund journalism — **please consider supporting content creators** by subscribing to publications you value.

See [DISCLAIMER.md](DISCLAIMER.md) for the complete legal disclaimer in English and German.

---

## Attribution

- Built on top of [Playwright MCP](https://github.com/microsoft/playwright-mcp) by Microsoft (Apache 2.0)
- Built on top of [Playwright](https://github.com/microsoft/playwright) by Microsoft (Apache 2.0)
- See [NOTICE](NOTICE) for full third-party attribution

---

## License

This project is licensed under the [MIT License](LICENSE).

Third-party dependencies are licensed under their own terms. See [LICENSES/](LICENSES/) for copies of dependency licenses.
