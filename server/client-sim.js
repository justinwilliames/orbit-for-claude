/**
 * Degraded-client simulation — measure the document the client ASSEMBLES,
 * not the one you authored.
 *
 * A render gate lays an email out in a full-CSS browser engine and reports
 * contrast ratios, tap targets and wrap points. Every one of those numbers is
 * true about a document Gmail will never build. Two transport facts break the
 * link between the authored HTML and the delivered HTML, and neither is
 * visible to any check that reads the source:
 *
 *   1. Gmail's style sanitizer is BLOCK-ATOMIC. One poison construct kills
 *      every rule in that <style> tag — including the plain rules that came
 *      before it. MJML merges every `mj-style` into ONE block, so a single
 *      `@property` anywhere in an imported design silently deletes the entire
 *      head stylesheet. The render gate measures the surviving-CSS version and
 *      reports PASS.
 *   2. ESP CSS inliners HOIST a <table> out of any <a> that directly wraps it,
 *      leaving an empty dead anchor. The authored HTML is perfectly valid; the
 *      delivered buttons are unclickable.
 *
 * This module does two things, both credential-free and browser-free:
 *   (a) emits the DEGRADED HTML for each client class, so the render gate can
 *       be run against the delivered document rather than the authored one;
 *   (b) runs the static purity checks that need no render at all.
 *
 * The value is running the SAME measurements under each class and diffing —
 * a fallback path that was never exercised then fails loudly instead of being
 * assumed. This module deliberately adds no new layout assertions of its own.
 *
 * Sources: direct inspection of the delivered DOM in Gmail webmail devtools
 * after real test sends, not a third-party client matrix.
 */

/**
 * Constructs confirmed or strongly suspected to kill a whole <style> block in
 * Gmail webmail. `@property` is the confirmed one — the only single construct
 * whose block died under isolation. The rest are candidates that have never
 * been isolated; they are listed because a design that avoids all of them is
 * provably safe and a design that uses one is worth a real test send.
 */
const POISON = [
  { pattern: /@property\b/i, name: "@property", confidence: "confirmed" },
  { pattern: /@font-face\b/i, name: "@font-face", confidence: "suspected" },
  { pattern: /@media[^{]*hover/i, name: "@media (hover:…)", confidence: "suspected" },
  { pattern: /::(?:before|after)\b/i, name: "::before / ::after", confidence: "suspected" },
  { pattern: /-webkit-mask|(?<![-\w])mask\s*:/i, name: "mask", confidence: "suspected" },
  { pattern: /\[[a-z-]+\]\s*\{/i, name: "attribute selector", confidence: "suspected" },
];

/**
 * Constructs verified SAFE in isolation. Listed so the tool can say "this is
 * fine" with a reason instead of staying quiet, which reads as untested.
 */
const VERIFIED_SAFE = [
  "@keyframes",
  ":hover rules (simple and descendant)",
  "@supports (inner rules dropped, block survives)",
  "animation / transition / transform properties",
  "@media (min-width) / (max-width)",
  "!important inside a media rule",
];

const CLASS_NAMES = ["full", "nocss", "gmailish", "gmailish_worstcase", "imgoff", "reduced", "nohover"];

/**
 * Emit the degraded documents plus the static purity findings.
 *
 * @param {object} args
 * @param {string} args.html
 * @param {string[]} [args.classes]         Subset of CLASS_NAMES.
 * @param {boolean} [args.include_html=true] Emit the degraded documents. Turn
 *   off when you only want the purity verdict and not six copies of the email.
 */
export function clientSim({ html, classes, include_html: includeHtml = true } = {}) {
  if (typeof html !== "string" || html.trim().length === 0) {
    return {
      status: "needs_inputs",
      missing: ["html"],
      message: "Provide the compiled email HTML.",
    };
  }

  const wanted = Array.isArray(classes) && classes.length > 0
    ? classes.filter((c) => CLASS_NAMES.includes(c))
    : CLASS_NAMES;
  if (wanted.length === 0) {
    return {
      status: "needs_inputs",
      missing: ["classes"],
      message: `Unknown client class. Valid values: ${CLASS_NAMES.join(", ")}.`,
    };
  }

  const blocks = styleBlocks(html);
  const purity = purityChecks(html, blocks);

  const variants = wanted.map((name) => {
    const built = degrade(name, html, blocks);
    return {
      class: name,
      what_it_models: WHAT_IT_MODELS[name],
      style_blocks_kept: built.kept,
      style_blocks_dropped: built.dropped,
      bytes: Buffer.byteLength(built.html, "utf8"),
      render_hints: RENDER_HINTS[name],
      html: includeHtml ? built.html : null,
    };
  });

  const fails = purity.filter((f) => f.severity === "fail");
  return {
    status: "ok",
    verdict: fails.length === 0 ? "pass" : "fail",
    style_blocks: blocks.length,
    purity_findings: purity,
    verified_safe_constructs: VERIFIED_SAFE,
    variants,
    summary: {
      failures: fails.length,
      headline:
        fails.length === 0
          ? `No block-atomic poison and no anchor-wrapped table. ${variants.length} degraded document(s) emitted.`
          : `${fails.length} transport defect(s) that no render of the authored HTML can show you.`,
    },
    next_step:
      "Run orbit_render_gate on each emitted `html` and DIFF the results. A " +
      "finding that appears under `gmailish` or `nocss` but not under `full` " +
      "is a fallback path nobody has ever exercised. Measuring only `full` is " +
      "measuring a document your recipients will not receive. " +
      "`gmailish_worstcase` is the speculative view — it drops blocks on " +
      "constructs nobody has isolated, so a finding that appears ONLY there is " +
      "a reason to run a real test send, not a defect to fix on faith.",
  };
}

const WHAT_IT_MODELS = {
  full: "The authored document, untouched. The baseline every other class is diffed against.",
  nocss:
    "Every <style> stripped. Models the clipped Gmail tail and any client that " +
    "drops head styles outright. Inline styles only.",
  gmailish:
    "Gmail webmail's sanitizer, as OBSERVED: a <style> block containing a " +
    "construct confirmed to kill a block dies WHOLE, the rest survive, and " +
    "interaction media features never apply.",
  gmailish_worstcase:
    "The same sanitizer if every SUSPECTED killer in the poison table also " +
    "kills a block. Speculative by construction — none of those constructs has " +
    "been isolated. Diff it against `gmailish` to see what is riding on an " +
    "unproven assumption; do not treat it as transport truth.",
  imgoff: "Images blocked. The bgcolor-and-alt world most recipients see first.",
  reduced: "prefers-reduced-motion: reduce.",
  nohover: "A hover-incapable client. Every rest state must be complete on its own.",
};

const RENDER_HINTS = {
  full: {},
  nocss: {},
  gmailish: { honour_interaction_media: false },
  gmailish_worstcase: { honour_interaction_media: false },
  imgoff: { block_images: true },
  reduced: { media_features: [{ name: "prefers-reduced-motion", value: "reduce" }] },
  nohover: { never_hover: true },
};

/** Every <style>…</style> block, with its span in the source. */
function styleBlocks(html) {
  const out = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html))) {
    out.push({ full: m[0], body: m[1], start: m.index, end: re.lastIndex });
  }
  return out;
}

/** Which poison constructs a block contains. */
function poisonIn(block) {
  return POISON.filter((p) => p.pattern.test(block.body));
}

function degrade(name, html, blocks) {
  if (name === "nocss") {
    return {
      html: html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ""),
      kept: 0,
      dropped: blocks.length,
    };
  }
  if (name === "gmailish" || name === "gmailish_worstcase") {
    // purityChecks already grades these two confidence tiers apart — confirmed
    // is a fail, suspected is a warn. The emitted document has to honour the
    // same line, or the default `gmailish` view deletes real CSS on a hunch
    // and the next_step below tells the reader to treat that diff as transport
    // truth. `gmailish` = what we have watched die. `gmailish_worstcase` =
    // what MIGHT die, labelled as speculation.
    const speculative = name === "gmailish_worstcase";
    let kept = 0;
    let dropped = 0;
    const out = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (block) => {
      const dies = POISON.some(
        (p) => (speculative || p.confidence === "confirmed") && p.pattern.test(block)
      );
      if (dies) {
        dropped += 1;
        return "";
      }
      kept += 1;
      return block;
    });
    return { html: out, kept, dropped };
  }
  // full / imgoff / reduced / nohover differ by RENDER conditions, not markup.
  return { html, kept: blocks.length, dropped: 0 };
}

function purityChecks(html, blocks) {
  const findings = [];

  // ── 1. Block-atomic poison ───────────────────────────────────────
  blocks.forEach((block, index) => {
    const hits = poisonIn(block);
    if (hits.length === 0) return;
    const confirmed = hits.filter((h) => h.confidence === "confirmed");
    const rules = (block.body.match(/\{/g) || []).length;
    findings.push({
      check: "block_atomic_poison",
      severity: confirmed.length > 0 ? "fail" : "warn",
      style_block: index,
      constructs: hits.map((h) => `${h.name} (${h.confidence})`),
      message:
        `<style> block ${index} contains ${hits.map((h) => h.name).join(", ")}. ` +
        `Gmail's sanitizer is block-atomic: if this block dies, all ~${rules} rules ` +
        "in it die with it, including the plain rules ABOVE the offending one. " +
        (confirmed.length > 0
          ? "@property is the confirmed killer. MJML merges every mj-style into " +
            "ONE block, so a single @property anywhere in an imported design " +
            "deletes the entire head stylesheet — and a render gate on the " +
            "authored HTML will still report PASS."
          : "Not confirmed in isolation, but worth splitting into its own block " +
            "so the rest of your CSS does not ride on it."),
      fix:
        "Move the construct into its own <style> block (MJML: a separate " +
        "mj-style is still merged, so this has to happen after compile), or " +
        "drop it. Anything that does not survive Gmail is DROPPED, not degraded.",
    });
  });

  // ── 2. The inliner's anchor hoist ────────────────────────────────
  // An <a> that directly wraps a <table>. When an ESP inliner runs, the table
  // is hoisted OUT and the anchor is left empty — a dead button in perfectly
  // valid authored HTML. One live send delivered twenty of them.
  const hoisted = anchorWrappedTables(html);
  if (hoisted.length > 0) {
    findings.push({
      check: "anchor_wraps_table",
      severity: "fail",
      count: hoisted.length,
      samples: hoisted.slice(0, 3),
      message:
        `${hoisted.length} anchor(s) directly wrap a <table>. Every mainstream ESP ` +
        "CSS inliner hoists the table OUT of the anchor, leaving an empty dead " +
        "<a>. The authored HTML is valid and the render gate finds nothing; the " +
        "delivered buttons are unclickable.",
      fix:
        "Invert the nesting — put the <table> on the outside and the <a> inside " +
        "the <td>. And turn CSS inlining OFF at the template level: on Braze " +
        "that is should_inline_css:false, verified by reading the value back, " +
        "never by trusting the 2xx.",
    });
  }

  // ── 3. No head CSS at all ────────────────────────────────────────
  if (blocks.length === 0) {
    findings.push({
      check: "no_head_css",
      severity: "info",
      message:
        "No <style> block at all, so the block-atomic risk is nil and `nocss` " +
        "is byte-identical to `full`. Inline-only emails are the most " +
        "transport-robust shape there is.",
    });
  }

  return findings;
}

/**
 * Anchors whose first element child is a <table>.
 *
 * Scanned with a depth walk rather than a regex: a non-greedy `<a[^>]*>\s*<table`
 * misses the very common case of a comment or an MSO conditional between the
 * two, which the inliner does not care about at all.
 */
function anchorWrappedTables(html) {
  const out = [];
  const re = /<a\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const after = html.slice(re.lastIndex, re.lastIndex + 400);
    const stripped = after.replace(/^(?:\s|<!--[\s\S]*?-->)*/, "");
    if (/^<table\b/i.test(stripped)) {
      out.push(m[0].slice(0, 120));
    }
  }
  return out;
}

export { CLASS_NAMES, POISON, VERIFIED_SAFE };
