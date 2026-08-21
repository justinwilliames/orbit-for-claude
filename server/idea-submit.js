/**
 * Product-idea submission — the explicit half of the feedback loop.
 *
 * DELIBERATELY NOT TELEMETRY. This module never imports postTelemetry
 * and never touches the telemetry endpoint: the telemetry contract
 * promises "no user content", and this feature exists to carry content
 * the user explicitly approved. It shares only the opaque install id
 * (getClientId), so a submitter can retract their own idea. It fires
 * regardless of ORBIT_TELEMETRY — an explicit ask is its own consent,
 * and opting out of passive telemetry should not break an explicit
 * feature.
 *
 * The consent mechanics live in the tool DESCRIPTIONS, which instruct
 * the calling model to compose the idea WITH the user and show the
 * exact text for approval before calling. The handler then redacts
 * on-device (emails/URLs/paths/keys/numbers → placeholders) and echoes
 * back verbatim what was actually sent, plus a retraction ref — so the
 * user always sees both what left the machine and how to un-send it.
 *
 * Registration is dependency-injected (registerIdeaTools receives
 * registerToolSafe, z, version, makeResponse from index.js) so this
 * module stays import-light and directly testable.
 */

import { getClientId } from "./telemetry.js";
import { redactSensitive } from "./redact.js";

const IDEA_ENDPOINT = process.env.ORBIT_IDEA_ENDPOINT || "https://yourorbit.team/api/mcp/idea";
const TIMEOUT_MS = 4000;

async function postJson(method, url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

/** Submit an idea. Exported for tests; the tool handler wraps this. */
export async function submitIdea({ title, detail, version, origin }) {
  const safeTitle = redactSensitive(title, 120);
  const safeDetail = redactSensitive(detail, 2000);
  // Origin separates "the user raised this unprompted" from "Orbit
  // noticed friction, offered to file it, and they said yes". Both are
  // explicit, user-approved submissions — the consent contract is
  // identical — but they are NOT equally strong demand signals, and the
  // inbox was previously unable to tell them apart. Anything we don't
  // recognise degrades to 'unknown' rather than being rejected.
  const safeOrigin =
    origin === "user_initiated" || origin === "orbit_prompted" ? origin : "unknown";
  let res;
  try {
    res = await postJson("POST", IDEA_ENDPOINT, {
      title: safeTitle,
      detail: safeDetail,
      clientId: getClientId(),
      version,
      origin: safeOrigin,
    });
  } catch {
    return { status: "send_failed", message: "Couldn't reach Orbit's idea inbox — network or timeout. Nothing was recorded; try again later." };
  }
  if (res.status === 429) {
    return { status: "rate_limited", message: "Daily idea limit reached (5 per install per day). The inbox is one person — this cap keeps it readable. Try again tomorrow." };
  }
  if (!res.json?.ok || !res.json?.ref) {
    return { status: "send_failed", message: "Orbit's idea inbox refused the submission. Nothing was recorded." };
  }
  return {
    status: "submitted",
    ref: res.json.ref,
    sent_title: safeTitle,
    sent_detail: safeDetail,
    note: "This exact text (after on-device redaction) is what was sent — nothing else. It lands in the developer's private inbox, never on a public page. Retract any time with orbit_retract_product_idea and this ref.",
  };
}

/** Retract a previously submitted idea. Exported for tests. */
export async function retractIdea({ ref }) {
  let res;
  try {
    const url = `${IDEA_ENDPOINT}?ref=${encodeURIComponent(ref)}&clientId=${encodeURIComponent(getClientId())}`;
    res = await postJson("DELETE", url);
  } catch {
    return { status: "send_failed", message: "Couldn't reach Orbit's idea inbox — try again later." };
  }
  return res.json?.ok
    ? { status: "retracted", ref, message: "Deleted — hard delete, not hidden. It is gone from the inbox." }
    : { status: "not_found", ref, message: "No idea with that ref belongs to this install — it may already be retracted." };
}

/** Register both tools. Called from index.js's registerTools(). */
export function registerIdeaTools({ registerToolSafe, z, version, makeResponse }) {
  registerToolSafe(
    "orbit_submit_product_idea",
    {
      title: "Submit a Product Idea to Orbit",
      description:
        "Send a feature request or product idea for Orbit to Orbit's developer. OFFER THIS when the user wants a capability Orbit doesn't have ('sorry, Orbit can't do that yet — want me to file it as an idea for the developer?'). CONSENT CONTRACT, non-negotiable: compose the title and detail WITH the user, show them the EXACT final text, and get their explicit yes BEFORE calling this tool — the content is user-approved words, never a summary of the conversation you wrote yourself. On-device redaction strips emails, URLs, file paths, keys, and number sequences before sending. Ideas land in the developer's private inbox (never public) and the response includes a ref that retracts the idea via orbit_retract_product_idea.",
      inputSchema: {
        title: z.string().min(3).max(120).describe("Short name for the idea — the user's approved wording."),
        detail: z.string().min(10).max(2000).describe("What they need and why — the user's approved wording, not your paraphrase."),
        origin: z
          .enum(["user_initiated", "orbit_prompted"])
          .optional()
          .describe("Did they ask unprompted, or agree after you offered? Answer honestly."),
      },
    },
    async ({ title, detail, origin }) => makeResponse(await submitIdea({ title, detail, version, origin })),
  );

  registerToolSafe(
    "orbit_retract_product_idea",
    {
      title: "Retract a Product Idea",
      description:
        "Hard-delete a previously submitted product idea from Orbit's inbox, by the ref returned at submission. Only works from the same install that submitted it.",
      inputSchema: {
        ref: z.string().regex(/^idea_[a-f0-9]{16}$/).describe("The ref returned by orbit_submit_product_idea."),
      },
    },
    async ({ ref }) => makeResponse(await retractIdea({ ref })),
  );
}
