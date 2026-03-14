/**
 * Custom MCP tool: browser_read_page
 *
 * Captures the current page as a full-page screenshot for visual reading.
 * Intended for pages where the HTML/accessibility snapshot is too garbled
 * or heavily formatted to be useful — the AI reads the image via vision instead.
 */

const READ_PAGE_TOOL = {
  name: 'browser_read_page',
  description:
    'Capture the current page as a full-page screenshot for visual reading via OCR/vision. ' +
    'Use this when the page snapshot or HTML is too garbled, heavily formatted, or contains ' +
    'visual content (charts, infographics, complex tables, PDFs) that is better understood as images. ' +
    'Returns one or more images for the AI to read with its vision capabilities.',
  inputSchema: {
    type: 'object',
    properties: {
      maxTiles: {
        type: 'number',
        description: 'Maximum number of viewport tiles to capture (default: 5, max: 10). Each tile is one viewport height.',
        default: 5,
      },
    },
  },
};

/**
 * Register custom tools onto an existing @playwright/mcp Server instance.
 * Intercepts tools/list and tools/call handlers to inject our tools.
 */
export function registerCustomTools(server) {
  const originalToolsList = server._requestHandlers.get('tools/list');
  const originalToolsCall = server._requestHandlers.get('tools/call');

  server._requestHandlers.set('tools/list', async (request, extra) => {
    const result = await originalToolsList(request, extra);
    result.tools = [...(result.tools || []), READ_PAGE_TOOL];
    return result;
  });

  server._requestHandlers.set('tools/call', async (request, extra) => {
    if (request.params?.name === 'browser_read_page') {
      return handleReadPage(originalToolsCall, request, extra);
    }
    return originalToolsCall(request, extra);
  });
}

async function handleReadPage(originalToolsCall, request, extra) {
  const maxTiles = Math.min(request.params?.arguments?.maxTiles || 5, 10);

  try {
    const screenshotRequest = {
      ...request,
      params: {
        name: 'browser_take_screenshot',
        arguments: { type: 'png', fullPage: true },
      },
    };

    const result = await originalToolsCall(screenshotRequest, extra);

    if (result?.content) {
      const images = result.content.filter(c => c.type === 'image');
      const text = result.content.filter(c => c.type === 'text');

      if (images.length > 0) {
        return {
          content: [
            {
              type: 'text',
              text: `Full page captured as ${images.length} image(s). Read the image content using vision to extract text and information from the page.`,
            },
            ...images.slice(0, maxTiles),
            ...text,
          ],
        };
      }
    }

    return {
      content: [
        { type: 'text', text: 'Full page screenshot captured.' },
        ...(result?.content || []),
      ],
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Failed to capture page: ${err.message}` }],
      isError: true,
    };
  }
}

export { READ_PAGE_TOOL };
