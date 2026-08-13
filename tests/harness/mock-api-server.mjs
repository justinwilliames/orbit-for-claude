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
/**
 * The Braze list endpoints that are 0-indexed `?page=` walks with no
 * continuation token in the response. A mock that ignores `page` and serves
 * the whole array on every call cannot tell a paginated read apart from an
 * un-paginated one — which is precisely how a single-page audit shipped
 * reporting `truncated: false` over a third of a workspace.
 */
const PAGED_LIST_ROUTES = {
  "/campaigns/list": "campaigns",
  "/canvas/list": "canvases",
  "/segments/list": "segments",
  "/events/list": "events"
};

/**
 * The `limit` / `offset` list endpoints. Braze caps these at 100 per call by
 * DEFAULT, so an un-paginated read of a 250-template library returns a round
 * 100 and reads like a complete small workspace. A mock that ignores the
 * parameters cannot tell the two apart either.
 */
const OFFSET_LIST_ROUTES = {
  "/templates/email/list": "templates",
  "/content_blocks/list": "content_blocks"
};

/** Braze's own default page size for the limit/offset endpoints. */
const OFFSET_DEFAULT_LIMIT = 100;

export async function startMockApiServer() {
  const responses = new Map(); // method + path pattern -> handler
  const requests = [];
  let pageSize = 100; // Braze's own default for /campaigns/list

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
    setResponse("GET", "/canvas/data_summary", loadFixture("braze", "canvas-data-summary"));
    setResponse("GET", "/campaigns/data_series", loadFixture("braze", "campaign-data-series"));
    setResponse("GET", "/events/data_series", loadFixture("braze", "events-data-series"));
    // The denominator. Without it there is no share to report, only a
    // pile of per-programme numbers that add up to whatever they add up
    // to — which is the whole reason orbit_audit_attributed_revenue
    // exists.
    setResponse("GET", "/purchases/revenue_series", loadFixture("braze", "purchases-revenue-series"));
    setResponse("GET", "/messages/scheduled_broadcasts", loadFixture("braze", "scheduled-broadcasts"));
    setResponse("GET", "/preference_center/v1/list", loadFixture("braze", "preference-centre-list"));
    // Per-centre details are keyed by the id in the path. Both ids from the
    // list fixture are stubbed so the default audit walks a compliant centre
    // and a non-compliant one without any test-side setup.
    setResponse("GET", "/preference_center/v1/pc-compliant", loadFixture("braze", "preference-centre-compliant"));
    setResponse("GET", "/preference_center/v1/pc-legacy", loadFixture("braze", "preference-centre-legacy"));
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

    // Page the walk-pages list endpoints the way Braze does: page 0 is the
    // first slice, and a page past the end comes back with an empty array
    // rather than a marker.
    const pagedKey = PAGED_LIST_ROUTES[url.pathname];
    if (pagedKey && handler && typeof handler === "object" && Array.isArray(handler[pagedKey])) {
      const page = Math.max(0, Number(url.searchParams.get("page") ?? 0) || 0);
      handler = { ...handler, [pagedKey]: handler[pagedKey].slice(page * pageSize, (page + 1) * pageSize) };
    }

    const offsetKey = OFFSET_LIST_ROUTES[url.pathname];
    if (offsetKey && handler && typeof handler === "object" && Array.isArray(handler[offsetKey])) {
      const limit = Math.max(1, Number(url.searchParams.get("limit")) || OFFSET_DEFAULT_LIMIT);
      const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
      handler = { ...handler, [offsetKey]: handler[offsetKey].slice(offset, offset + limit) };
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
    /** Shrink the page size so a small fixture can exercise a real page walk. */
    setPageSize(n) { pageSize = Math.max(1, Number(n) || 1); },
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
