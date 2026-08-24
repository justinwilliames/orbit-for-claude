/**
 * Slim the tools/list payload by removing bytes that carry no meaning.
 *
 * WHY THIS EXISTS. Orbit registers 135 tools. Measured on the real
 * payload, 12,420 bytes of it are boilerplate the MCP SDK stamps onto
 * every single tool, identically, whether Orbit asks for it or not:
 *
 *   "$schema":"http://json-schema.org/draft-07/schema#"   7,020 bytes
 *   "execution":{"taskSupport":"forbidden"}               5,400 bytes
 *
 * Neither is Orbit's. `$schema` is injected by the SDK's
 * toJsonSchemaCompat and appears nowhere in server/. `execution` is
 * hard-coded as `{ taskSupport: 'forbidden' }` inside registerTool
 * (mcp.js) with no way to configure it — 135 identical copies of the
 * value that is already the semantic default for a non-task handler.
 *
 * Every previous attempt to find fat measured the CONTENTS of the tool
 * entries — descriptions, schemas, parameter prose — concluded there was
 * none, and was right. Nobody measured the WRAPPER.
 *
 * WHAT THIS DELIBERATELY DOES NOT TOUCH.
 *   · `annotations` — 3,338 bytes, and the one strip that was tried and
 *     REJECTED. See the block below; it is a safety call, not an
 *     oversight.
 *   · `_meta` — 23 tools carry widget blocks there. Load-bearing.
 *   · `title` — optional in the spec, but host UIs display it.
 *   · `maxLength` — 5,341 bytes and tempting. NOT taken: the server
 *     enforces it either way via zod, but publishing it lets a client
 *     reject an over-long argument BEFORE a round trip. Removing it
 *     turns a client-side catch into a server-side error. That is a
 *     real, if small, regression in behaviour, and the brief for this
 *     work was explicitly "as long as it does not impact the MCP
 *     negatively". It fails that test, so it stays.
 *
 * FAILS OPEN, ALWAYS. Every strip is wrapped so that anything
 * unexpected — an SDK upgrade changing the response shape, a tool
 * without an inputSchema, a null where an object was assumed — returns
 * the ORIGINAL response untouched. The worst case this can produce is
 * "no saving", never "broken tools". That asymmetry is the whole design:
 * a byte optimisation must never be able to take the product down.
 *
 * It also WRAPS the SDK's own handler rather than reimplementing it. The
 * SDK builds each tool definition from the registered zod schemas; if a
 * future version adds a field, we post-process whatever it produced
 * instead of silently diverging from it.
 */

/**
 * ANNOTATIONS ARE DELIBERATELY NOT STRIPPED — 3,338 bytes left on the
 * table, on purpose.
 *
 * They could be. Every spec default falls the conservative way: a client
 * reading a missing readOnlyHint MUST assume false (not read-only), a
 * missing destructiveHint MUST assume true. So removing an annotation
 * that already equals its default cannot make a host treat a dangerous
 * tool as safe — on a conforming client.
 *
 * Taken anyway? No. Two reasons, and the second is the real one.
 *
 * First, it rests on every client implementing the defaults correctly.
 * The saving is 2% of the payload; the downside is a host somewhere
 * running a write tool without a prompt.
 *
 * Second, and decisive: tests/suites/27-tool-annotations.test.mjs exists
 * because Orbit ONCE shipped 57 tools carrying a readOnlyHint nobody had
 * checked. That suite asserts, per tool, that a remote-write tool is
 * never marked read-only. Strip the explicit values and those assertions
 * read `undefined` and can no longer tell a deliberate `false` from an
 * absent one — the gate goes quiet exactly where it was installed to
 * shout. Trading a safety invariant for 2% of a payload that a deferring
 * host does not even load is a bad trade.
 */

/**
 * The JSON Schema dialect the SDK stamps on every inputSchema. Matched
 * by value, not merely by key: if a tool ever declares a DIFFERENT
 * dialect, that is a real statement about how to parse it and must
 * survive.
 */
const SDK_INJECTED_SCHEMA_DIALECT = "http://json-schema.org/draft-07/schema#";

/** The one execution value registerTool hard-codes. Anything else is a
 *  deliberate choice by a caller and is left alone. */
const SDK_DEFAULT_TASK_SUPPORT = "forbidden";

/**
 * Slim one tool definition. Pure: returns a new object, never mutates
 * the SDK's. On any surprise, returns the input unchanged.
 */
export function slimToolDefinition(tool) {
  if (!tool || typeof tool !== "object") return tool;

  try {
    const out = { ...tool };

    // 1. The injected JSON Schema dialect — but only if it IS the
    //    injected one. A tool declaring another dialect keeps it.
    if (
      out.inputSchema &&
      typeof out.inputSchema === "object" &&
      out.inputSchema.$schema === SDK_INJECTED_SCHEMA_DIALECT
    ) {
      const { $schema, ...rest } = out.inputSchema;
      out.inputSchema = rest;
    }

    // 2. execution, only when it is exactly the SDK's hard-coded default.
    //    A tool that genuinely supports tasks says so and is untouched.
    if (
      out.execution &&
      typeof out.execution === "object" &&
      Object.keys(out.execution).length === 1 &&
      out.execution.taskSupport === SDK_DEFAULT_TASK_SUPPORT
    ) {
      delete out.execution;
    }

    // Annotations are NOT touched. See the header for why.

    return out;
  } catch {
    // Fail open: an un-slimmed tool is correct, just larger.
    return tool;
  }
}

/**
 * Wrap the server's already-registered tools/list handler so its
 * response is slimmed on the way out.
 *
 * Call AFTER every tool is registered. Returns true if the wrap was
 * installed, false if it could not be (which is not an error — the
 * server keeps working, just fatter). Never throws.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} mcpServer
 */
export function installSlimToolsList(mcpServer) {
  try {
    const inner = mcpServer?.server;
    const handlers = inner?._requestHandlers;
    if (!handlers || typeof handlers.get !== "function") return false;

    const METHOD = "tools/list";
    const original = handlers.get(METHOD);
    if (typeof original !== "function") return false;

    handlers.set(METHOD, async (request, extra) => {
      const response = await original(request, extra);
      try {
        if (!response || !Array.isArray(response.tools)) return response;
        return { ...response, tools: response.tools.map(slimToolDefinition) };
      } catch {
        return response;
      }
    });

    return true;
  } catch {
    return false;
  }
}
