# Playwright MCP Extended

[![Integration Tests](https://github.com/moodl/playwright-mcp-extended/actions/workflows/test.yml/badge.svg)](https://github.com/moodl/playwright-mcp-extended/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A drop-in wrapper around Microsoft's [@playwright/mcp](https://github.com/microsoft/playwright-mcp) that automatically handles cookie consent banners. Includes a custom `browser_read_page` tool for full-page visual reading via AI vision/OCR.

> **Note:** This is an independent community project. It is **not** a fork of the Playwright MCP source code and is **not affiliated with or endorsed by Microsoft** or the Playwright team. It uses `@playwright/mcp` as a runtime dependency under the [Apache License 2.0](LICENSES/Apache-2.0.txt). See [NOTICE](NOTICE) for full attribution.

---

## Features

| Feature | What it does |
|---|---|
| **Cookie Consent** | Detects and auto-dismisses cookie banners from 120+ CMP selectors covering all major platforms (OneTrust, Cookiebot, Didomi, SourcePoint, Quantcast, TrustArc, Complianz, Iubenda, Usercentrics, CookieYes, Axeptio, and many more). Handles iframe-based CMPs, dynamically injected banners, consent walls, and includes heuristic fallback detection. Supports 10+ languages. |
| **Visual Page Reading** | Custom `browser_read_page` tool captures full-page screenshots for AI vision/OCR — use when HTML is too garbled, heavily formatted, or contains charts/infographics that are better read as images. |

### Cookie Consent Strategy

The cookie middleware uses a 4-layer approach:

1. **Known CMP selectors** (fast path) — click accept buttons on recognized platforms
2. **Iframe CMP removal** — removes cross-origin iframe containers (SourcePoint, TrustArc, etc.) that can't be interacted with from the main page
3. **Heuristic detection** — finds fixed-position overlays with cookie-related text and removes them
4. **Consent wall handling** — scans entire page for accept buttons when the page itself is a consent form (full-page gate with no separate banner)

Additional features:
- **MutationObserver** watches for dynamically injected banners for 10 seconds after page load
- **Scroll restoration** unlocks body/html overflow locked by CMPs
- Retries at 500ms, 1.5s, and 3s to catch late-appearing elements

---

## Quick Start

### As a Claude Code MCP Server

Add to your MCP configuration (e.g., project `.mcp.json`):

```json
{
  "mcpServers": {
    "playwright-extended": {
      "command": "node",
      "args": ["/path/to/playwright-mcp-extended/src/cli.js", "--headless"]
    }
  }
}
```

### CLI

```bash
# All middleware enabled (default)
node src/cli.js

# Headless mode (recommended for MCP server use)
node src/cli.js --headless

# With original Playwright MCP flags
node src/cli.js --headless --browser chrome

# Disable cookie consent middleware
node src/cli.js --no-cookie-consent
```

All original `@playwright/mcp` CLI options are fully supported and passed through.

### Programmatic API

```js
import { createConnection } from './src/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = await createConnection(
  { browser: { launchOptions: { headless: true } } },
  {
    cookieConsent: true,              // default: true
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## Custom Tools

In addition to all 22 standard [@playwright/mcp](https://github.com/microsoft/playwright-mcp) tools, this server adds:

| Tool | Description |
|---|---|
| `browser_read_page` | Captures the current page as a full-page screenshot for visual reading via AI vision/OCR. Use when the accessibility snapshot is too garbled, the page has complex formatting, or contains visual content (charts, infographics, tables, embedded PDFs) that is better understood as images. |

---

## How It Works

```
Client (Claude, etc.)
  |
  v
playwright-mcp-extended (programmatic MCP server)
  |  1. Creates @playwright/mcp server with init script injection
  |  2. Registers custom tools (browser_read_page)
  |  3. Connects via stdio transport
  v
@playwright/mcp (unmodified)
  |  Injects init script into every browser page
  v
Browser Page
  |  1. Cookie consent auto-dismiss (selectors + iframe removal + heuristics)
  |  2. MutationObserver watches for late-injected banners
  v
Clean, readable page returned to client
```

No source code from Playwright or Playwright MCP is modified. This project uses the programmatic API and adds an init script layer + custom tools on top.

---

## Testing

### Fixture Tests (deterministic)

8 tests using local HTML pages simulating real-world cookie banners (OneTrust, Cookiebot, SourcePoint iframe, Quantcast, dynamically injected, consent walls):

```bash
npm test
```

### Real-World Tests (smoke tests against live websites)

Tests against various international websites with cookie banners (URLs configured in a gitignored config file):

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
| **Fixture Tests** | 8 deterministic tests against local HTML fixtures | Yes |
| **Real-world Tests** | Smoke tests against live websites | No (allowed to fail) |
| **Docker Tests** | Full test suite in a containerized environment | Yes |

---

## Project Structure

```
src/
  cli.js                         # CLI entry point (arg parsing + transport)
  index.js                       # Programmatic API (server creation + tool registration)
  middleware/
    index.js                     # Middleware orchestrator
    cookie-consent.js            # Cookie banner detection & dismissal (120+ selectors)
  tools/
    read-page.js                 # browser_read_page custom tool
test/
  integration.test.js            # Fixture-based tests (8 tests)
  real-world.test.js             # Live website tests
  server.js                      # Local test HTTP server
  fixtures/                      # HTML test pages (6 fixtures)
```

---

## Reporting Issues

If an AI agent cannot properly load or read a page when using this MCP server, **please open an issue** on the [GitHub repository](https://github.com/moodl/playwright-mcp-extended/issues) with:

1. The URL that failed to load properly
2. What happened (cookie banner not dismissed, page broken, etc.)
3. A screenshot if possible

This helps us add support for new CMP platforms and fix edge cases. Common reasons pages may not load:

- **Bot detection** (Cloudflare, reCAPTCHA) — this is a site-level block unrelated to cookie consent
- **Unsupported CMP** — the cookie consent platform isn't in our selector list yet
- **Consent wall** — the site redirects to a consent page instead of showing a banner overlay
- **Custom implementation** — the site uses a non-standard consent mechanism

---

## Attribution

- Built on top of [Playwright MCP](https://github.com/microsoft/playwright-mcp) by Microsoft (Apache 2.0)
- Built on top of [Playwright](https://github.com/microsoft/playwright) by Microsoft (Apache 2.0)
- Cookie consent approach inspired by [DuckDuckGo autoconsent](https://github.com/duckduckgo/autoconsent), [Consent-O-Matic](https://github.com/cavi-au/Consent-O-Matic), and [I Still Don't Care About Cookies](https://github.com/OhMyGuus/I-Still-Dont-Care-About-Cookies)
- See [NOTICE](NOTICE) for full third-party attribution

---

## License

This project is licensed under the [MIT License](LICENSE).

Third-party dependencies are licensed under their own terms. See [LICENSES/](LICENSES/) for copies of dependency licenses.
