/**
 * Single in-process HTTP mock server covering Braze, Figma, and Gemini.
 *
 * Boots on a random localhost port, returns canned fixtures, and records
 * every request so tests can assert on what the tool sent.
 *
 * Tests configure the server's behaviour via `setResponse(path, value)`
 * before calling tools, so each test can simulate success, 404, 401,
 * rate-limit, etc. without touching the global state.
 */

import { createServer } from "node:http";
import { URL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HARNESS_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(HARNESS_DIR, "..", "fixtures");

/** Load a JSON fixture from tests/fixtures/<vendor>/<name>.json. */
export function loadFixture(vendor, name) {
  const filePath = path.join(FIXTURES_DIR, vendor, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fixture not found: ${vendor}/${name}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/**
 * Start the mock server. Returns { url, setResponse, getRequests, close, env }.
 *
 * env is a ready-to-merge object of environment variables that point
 * Orbit's external API clients at this mock instead of real endpoints.
 */
export async function startMockApiServer() {
  const responses = new Map(); // method + path pattern -> handler
  const requests = [];

  function key(method, urlPath) {
    return `${method.toUpperCase()} ${urlPath}`;
  }

  function setResponse(method, urlPath, value) {
    responses.set(key(method, urlPath), value);
  }

  // Default responses — cover every endpoint Orbit touches with a sensible
  // fixture so a tool call never crashes because the mock didn't know the
  // route. Tests override specific routes for auth / error scenarios.
  function installDefaults() {
    // --- Braze read endpoints
    setResponse("GET", "/canvas/list", { canvases: loadFixture("braze", "canvas-list").canvases });
    setResponse("GET", "/campaigns/list", { campaigns: loadFixture("braze", "campaigns-list").campaigns });
    setResponse("GET", "/segments/list", { segments: loadFixture("braze", "segments-list").segments });
    setResponse("GET", "/content_blocks/list", { content_blocks: loadFixture("braze", "content-blocks-list").content_blocks });
    setResponse("GET", "/templates/email/list", { templates: loadFixture("braze", "templates-list").templates });
    setResponse("GET", "/events/list", { events: loadFixture("braze", "events-list").events });
    setResponse("GET", "/custom_attributes", { attributes: loadFixture("braze", "attributes-list").attributes });
    setResponse("GET", "/canvas/details", loadFixture("braze", "canvas-details"));
    setResponse("GET", "/campaigns/details", loadFixture("braze", "campaign-details"));
    setResponse("GET", "/segments/details", loadFixture("braze", "segment-details"));
    setResponse("GET", "/segments/data_series", loadFixture("braze", "segment-data-series"));
    setResponse("GET", "/content_blocks/info", loadFixture("braze", "content-block-info"));
    setResponse("GET", "/templates/email/info", loadFixture("braze", "template-info"));
    setResponse("GET", "/email/hard_bounces", { emails: [] });
    setResponse("GET", "/email/unsubscribes", { emails: [] });
    setResponse("GET", "/canvas/data_series", loadFixture("braze", "canvas-data-series"));
    setResponse("GET", "/campaigns/data_series", loadFixture("braze", "campaign-data-series"));
    setResponse("GET", "/users/export/ids", { users: [] });

    // --- Braze write endpoints
    setResponse("POST", "/content_blocks/create", {
      message: "success",
      content_block_id: "mock-block-id"
    });
    setResponse("POST", "/content_blocks/update", { message: "success" });
    setResponse("POST", "/templates/email/create", {
      message: "success",
      email_template_id: "mock-template-id"
    });
    setResponse("POST", "/templates/email/update", { message: "success" });
    setResponse("POST", "/media_library/create", {
      new_assets: [{ url: "https://mock-cdn.example/mock-asset.png", name: "mock-asset" }]
    });
    setResponse("POST", "/canvas/create", {
      message: "success",
      canvas_id: "mock-canvas-id"
    });

    // --- Figma endpoints
    setResponse("GET", "/files/mock-file", loadFixture("figma", "file-tree"));
    setResponse("GET", "/files/mock-file/nodes", loadFixture("figma", "file-nodes"));
    // The image-response fixture points at https://s3.example.com/... which
    // the handler then tries to download. Rewrite those URLs to point at
    // this mock server so the SVG fetch resolves locally.
    const imageResponse = loadFixture("figma", "image-response");
    if (imageResponse?.images) {
      for (const key of Object.keys(imageResponse.images)) {
        imageResponse.images[key] = `__MOCK_ORIGIN__/mock-svg.svg`;
      }
    }
    setResponse("GET", "/images/mock-file", imageResponse);
    // Serve a minimal valid SVG at the rewritten URL. handler does a
    // plain-text fetch so we respond with svg+xml content type.
    setResponse("GET", "/mock-svg.svg", {
      status: 200,
      headers: { "Content-Type": "image/svg+xml" },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="100%" height="100%" fill="white"/><text x="20" y="40" font-family="Inter" font-size="14" fill="#111">mock SVG</text></svg>'
    });
  }

  installDefaults();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const route = key(req.method, url.pathname);
    const body = await readBody(req);
    requests.push({
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      headers: {
        authorization: req.headers.authorization,
        "x-figma-token": req.headers["x-figma-token"],
        "content-type": req.headers["content-type"]
      },
      body
    });

    // Flexible path match: exact path first, then longest prefix that ends
    // with the same segments. Lets tests stub /canvas/list without caring
    // about query string.
    let handler = responses.get(route);
    if (!handler) {
      // Check for wildcard / prefix matches
      for (const [k, v] of responses.entries()) {
        const [method, pattern] = k.split(" ");
        if (method !== req.method) continue;
        if (pattern.endsWith("/*") && url.pathname.startsWith(pattern.slice(0, -1))) {
          handler = v;
          break;
        }
      }
    }

    if (!handler) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Mock server has no handler for ${route}` }));
      return;
    }

    // Handler may be an object (use as body, 200) or { status, body, headers }
    if (handler && typeof handler === "object" && ("status" in handler || "body" in handler)) {
      const status = handler.status ?? 200;
      const respBody = handler.body ?? {};
      res.writeHead(status, { "Content-Type": "application/json", ...(handler.headers ?? {}) });
      res.end(typeof respBody === "string" ? respBody : JSON.stringify(respBody));
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(handler));
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  // Rewrite any __MOCK_ORIGIN__ placeholders in fixture URLs now that
  // we know the dynamic port. Applies to Figma image responses that
  // need to redirect the handler's SVG fetch back through the mock.
  for (const [key, value] of responses.entries()) {
    if (typeof value === "object" && value !== null) {
      const replaced = JSON.parse(
        JSON.stringify(value).replaceAll("__MOCK_ORIGIN__", baseUrl)
      );
      responses.set(key, replaced);
    }
  }

  return {
    url: baseUrl,
    env: {
      // Route Braze, Figma, and Gemini through the mock. Gemini's mock
      // is separate (the server module reads ORBIT_TEST_MOCK_IMAGES=1).
      ORBIT_BRAZE_API_KEY: "mock-braze-key",
      ORBIT_BRAZE_REST_ENDPOINT: baseUrl,
      ORBIT_FIGMA_API_TOKEN: "mock-figma-token",
      ORBIT_FIGMA_API_BASE_URL: `${baseUrl}`,
      ORBIT_GOOGLE_AI_API_KEY: "mock-gemini-key",
      ORBIT_TEST_MOCK_IMAGES: "1"
    },
    setResponse,
    resetResponses: () => {
      responses.clear();
      installDefaults();
    },
    clearResponse: (method, urlPath) => responses.delete(key(method, urlPath)),
    getRequests: () => requests.slice(),
    clearRequests: () => { requests.length = 0; },
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve(null);
      try { resolve(JSON.parse(raw)); }
      catch { resolve(raw); }
    });
  });
}
