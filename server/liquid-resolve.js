/**
 * A small Liquid resolver for email templates.
 *
 * NOT a full Liquid engine, and it must never pretend to be one. It evaluates
 * the subset email templates actually use — `{% assign %}`, `{% capture %}`,
 * `{% if %}` / `{% elsif %}` / `{% else %}` / `{% endif %}`, `{% unless %}`,
 * a handful of filters, and personalisation tokens — and it RECORDS anything
 * it does not model rather than dropping it.
 *
 * That recording is the whole design. An unmodelled filter used to resolve to
 * the filter expression itself as a string, which reads truthy, compares equal
 * to nothing, and produces a plausible-looking render off a value that means
 * nothing. An unmodelled TAG is worse: dropping the tag leaves the body inline
 * unconditionally, so a guarded block renders for every recipient and its
 * condition is never read — and the resolver reports that confidently. Both
 * now land in `trace.unknownFilters` / `trace.unknownTags` so a caller can
 * fail loud instead of measuring junk.
 *
 * `server/liquid-state-matrix.js` is the caller that does. The generated brain
 * gate imports this too, which closes the dangling "resolve every branch,
 * never strip — compile and resolve upstream of this script" pointer in
 * server/brain/gate-generator.js: this IS the upstream.
 *
 * Personalisation dialects understood, keyed on the BINDING rather than on any
 * naming convention:
 *   Braze     {{custom_attribute.${name}}} · {{${first_name}}} · {{campaign.${name}}}
 *   Klaviyo   {{ person.name }} · {{ event.name }}
 *   Plain     {{ variable }}
 */

/** Liquid truthiness: only `false` and nil are falsy. "" is truthy. */
function truthy(v) {
  return v !== false && v !== undefined && v !== null;
}

/** Parse an assign rhs or an if operand: literal, or a bound variable. */
function parseVal(s, env) {
  s = String(s).trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  const quoted = s.match(/^'([^']*)'$/) || s.match(/^"([^"]*)"$/);
  if (quoted) return quoted[1];
  if (Object.prototype.hasOwnProperty.call(env, s)) return env[s];
  return s;
}

const FILTERS = {
  strip: (v) => String(v).trim(),
  downcase: (v) => String(v).toLowerCase(),
  upcase: (v) => String(v).toUpperCase(),
  capitalize: (v) => {
    const s = String(v);
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  },
  strip_newlines: (v) => String(v).replace(/[\r\n]/g, ""),
  strip_html: (v) => String(v).replace(/<[^>]*>/g, ""),
  size: (v) => String(v).length,
};

const FILTERS_ARG = {
  plus: (v, a) => (Number(v) || 0) + Number(a),
  minus: (v, a) => (Number(v) || 0) - Number(a),
  times: (v, a) => (Number(v) || 0) * Number(a),
  // Liquid's divided_by is INTEGER division when both operands are integers,
  // and the major ESPs behave the same way. Model the send, not the
  // arithmetic anyone would prefer: 27390 | divided_by: 100 is 273, not 273.9.
  divided_by: (v, a) => {
    const n = Number(v) || 0;
    const d = Number(a);
    if (!d) return 0;
    return Number.isInteger(n) && Number.isInteger(d) ? Math.floor(n / d) : n / d;
  },
  modulo: (v, a) => {
    const n = Number(v) || 0;
    const d = Number(a);
    return d ? ((n % d) + d) % d : 0;
  },
  default: (v, a) => (v === "" || v === undefined || v === null || v === false ? a : v),
  prepend: (v, a) => String(a) + String(v),
  append: (v, a) => String(v) + String(a),
  // Only the strftime tokens templates commonly use. Anything else returns the
  // input unchanged rather than inventing a format.
  date: (v, a) => {
    const t = new Date(String(v));
    if (Number.isNaN(t.getTime())) return v;
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    return String(a)
      .replace(/'/g, "")
      .replace(/%-d/g, String(t.getUTCDate()))
      .replace(/%d/g, String(t.getUTCDate()).padStart(2, "0"))
      .replace(/%B/g, months[t.getUTCMonth()])
      .replace(/%b/g, months[t.getUTCMonth()].slice(0, 3))
      .replace(/%Y/g, String(t.getUTCFullYear()));
  },
};

/**
 * Fold `a | f1 | f2: arg` left-to-right. Returns { value, unknown } — the
 * first unmodelled filter is NAMED so the caller can fail rather than accept a
 * value it has no reason to trust.
 */
function applyFilters(rhs, env) {
  const parts = String(rhs).split("|").map((s) => s.trim());
  let value = parseVal(parts[0], env);
  for (const part of parts.slice(1)) {
    if (!part) continue;
    const withArg = part.match(/^(\w+)\s*:\s*(.+)$/);
    if (withArg) {
      if (!FILTERS_ARG[withArg[1]]) return { value, unknown: withArg[1] };
      value = FILTERS_ARG[withArg[1]](value, parseVal(withArg[2], env));
    } else {
      if (!FILTERS[part]) return { value, unknown: part };
      value = FILTERS[part](value);
    }
  }
  return { value, unknown: null };
}

/** Split on a bare `and`/`or`, never inside a quoted literal. */
function splitTop(expr, keyword) {
  const out = [];
  const re = new RegExp(`\\s+${keyword}\\s+`, "g");
  let last = 0;
  let m;
  while ((m = re.exec(expr))) {
    const head = expr.slice(0, m.index);
    if ((head.match(/'/g) || []).length % 2 === 1) continue; // inside a literal
    out.push(expr.slice(last, m.index));
    last = m.index + m[0].length;
  }
  out.push(expr.slice(last));
  return out;
}

/** Evaluate a condition. Liquid has no parens, and `and` binds tighter. */
export function evalCond(expr, env) {
  const src = String(expr).trim();

  const ors = splitTop(src, "or");
  if (ors.length > 1) return ors.some((c) => evalCond(c, env));
  const ands = splitTop(src, "and");
  if (ands.length > 1) return ands.every((c) => evalCond(c, env));

  // `>=`/`<=` before `>`/`<`, or the two-char operators split wrong and the
  // right-hand side keeps a stray `=`.
  const cmp = src.match(/^(.+?)\s*(>=|<=|>|<)\s*(.+)$/);
  if (cmp) {
    const a = Number(parseVal(cmp[1], env));
    const b = Number(parseVal(cmp[3], env));
    if (Number.isNaN(a) || Number.isNaN(b)) return false; // fail closed, never guess
    switch (cmp[2]) {
      case ">": return a > b;
      case "<": return a < b;
      case ">=": return a >= b;
      default: return a <= b;
    }
  }

  const eqm = src.match(/^(.+?)\s*(==|!=)\s*(.+)$/);
  if (eqm) {
    // `blank` / `empty` / `nil` are KEYWORDS, not identifiers. parseVal hands
    // back the bare word when nothing is bound, so `x != blank` would compare
    // "" against the literal string "blank", find them different, and return
    // TRUE for an unset attribute — reading the condition backwards for every
    // profile that has no value, which is an ordinary state, not an edge case.
    const KEYWORD = /^(blank|empty|nil|null)$/;
    const lhs = eqm[1].trim();
    const rhs = eqm[3].trim();
    if (KEYWORD.test(rhs) || KEYWORD.test(lhs)) {
      const other = KEYWORD.test(rhs) ? lhs : rhs;
      const v = parseVal(other, env);
      const isBlank = v === undefined || v === null || String(v).trim() === "";
      return eqm[2] === "==" ? isBlank : !isBlank;
    }
    const eq = String(parseVal(eqm[1], env)) === String(parseVal(eqm[3], env));
    return eqm[2] === "==" ? eq : !eq;
  }

  return truthy(parseVal(src, env));
}

/** Resolve bare {{var}} outputs that reference an in-scope env var. */
function resolveEnvOutputs(text, env) {
  return text.replace(/\{\{\s*([a-zA-Z_]\w*)\s*\}\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(env, name) ? String(env[name]) : m
  );
}

/**
 * Tokenise into text / tag chunks.
 *
 * `id` is a STABLE per-tag ordinal in the ORIGINAL stream. evalIf slices the
 * token array when it recurses, which destroys array indices but not the token
 * objects — so the id rides along and an arm can be named identically in every
 * state of the matrix. That stable naming is what makes the dead-arm check
 * possible at all.
 */
export function tokenize(src) {
  const toks = [];
  let last = 0;
  let m;
  let id = 0;
  const re = /\{%([\s\S]*?)%\}/g;
  while ((m = re.exec(src))) {
    if (m.index > last) toks.push({ t: "text", v: src.slice(last, m.index) });
    toks.push({ t: "tag", v: m[1].trim(), id: id++ });
    last = re.lastIndex;
  }
  if (last < src.length) toks.push({ t: "text", v: src.slice(last) });
  return toks;
}

/** Recursive block evaluator. Mutates `env` — assigns must accumulate. */
function evalBlock(toks, i, env, stop, trace) {
  let out = "";
  while (i < toks.length) {
    const tok = toks[i];
    if (tok.t === "text") {
      out += resolveEnvOutputs(tok.v, env);
      i++;
      continue;
    }
    const verb = tok.v.split(/\s+/)[0];
    if (stop && verb === stop) return { out, i };
    if (verb === "assign") {
      doAssign(tok.v, env, trace);
      i++;
      continue;
    }
    if (verb === "capture") {
      const name = tok.v.split(/\s+/)[1];
      const r = evalBlock(toks, i + 1, env, "endcapture", trace);
      env[name] = r.out.trim();
      i = r.i + 1;
      continue;
    }
    if (verb === "if") {
      const r = evalIf(toks, i, env, trace, false);
      out += r.out;
      i = r.i;
      continue;
    }
    // `unless` is `if` with the condition negated and no elsif. Left
    // unmodelled it falls to the drop below, and dropping the TAG leaves the
    // BODY inline unconditionally — a guarded block rendering for every
    // recipient, its condition never read.
    if (verb === "unless") {
      const r = evalIf(toks, i, env, trace, true);
      out += r.out;
      i = r.i;
      continue;
    }
    // An unknown tag is NOT a no-op, it is an unmeasured branch. Record it.
    if (trace && !/^(end|else|elsif)/.test(verb)) trace.unknownTags.add(verb);
    i++;
  }
  return { out, i };
}

function doAssign(tag, env, trace) {
  const m = tag.match(/^assign\s+(\w+)\s*=\s*(.+)$/);
  if (!m) return;
  const { value, unknown } = applyFilters(m[2], env);
  if (unknown && trace) trace.unknownFilters.add(unknown);
  env[m[1]] = value;
}

/** if / elsif / else / endif, with depth tracking for nested blocks. */
function evalIf(toks, i, env, trace, negate) {
  const clauses = [];
  const blockId = toks[i].id;
  const CLOSER = negate ? "endunless" : "endif";
  let condTag = toks[i].v;
  let start = i + 1;
  let depth = 0;
  let j = i + 1;
  for (; j < toks.length; j++) {
    if (toks[j].t !== "tag") continue;
    const verb = toks[j].v.split(/\s+/)[0];
    // `unless` opens and closes a block exactly like `if`, so it bumps the
    // same counter — otherwise an `unless` nested inside an `if` steals the
    // outer block's `endif` and the clause spans come apart silently.
    if (verb === "if" || verb === "unless" || verb === "capture") depth++;
    else if (verb === "endif" || verb === "endunless" || verb === "endcapture") {
      if (depth > 0) depth--;
      else if (verb === CLOSER) {
        clauses.push({ condTag, start, end: j });
        break;
      }
    } else if (!negate && depth === 0 && (verb === "elsif" || verb === "else")) {
      clauses.push({ condTag, start, end: j });
      condTag = toks[j].v;
      start = j + 1;
    }
  }
  const after = j + 1;

  // Register EVERY arm, taken or not. The matrix later asserts each was taken
  // in at least one state; an arm taken in none is dead by construction.
  if (trace) {
    clauses.forEach((c, k) => {
      const key = `${blockId}#${k}`;
      if (!trace.arms.has(key)) trace.arms.set(key, c.condTag.trim());
    });
  }

  for (let k = 0; k < clauses.length; k++) {
    const c = clauses[k];
    const verb = c.condTag.split(/\s+/)[0];
    const raw = c.condTag.replace(/^(if|elsif|unless)\s+/, "");
    const take = verb === "else" || (negate ? !evalCond(raw, env) : evalCond(raw, env));
    if (take) {
      if (trace) trace.taken.add(`${blockId}#${k}`);
      return { out: evalBlock(toks.slice(c.start, c.end), 0, env, null, trace).out, i: after };
    }
  }
  return { out: "", i: after };
}

/**
 * Every personalisation token in the source, as {dialect, name, token}.
 *
 * Keyed on the BINDING SHAPE, never on a naming convention. A convention is a
 * thing somebody has to remember to extend; the binding is in the markup.
 */
export function personalisationTokens(src) {
  const found = new Map();
  const add = (dialect, name, token) => {
    if (!found.has(name)) found.set(name, { dialect, name, token });
  };
  for (const m of String(src).matchAll(/\{\{\s*custom_attribute\.\$\{(\w+)\}\s*\}\}/g)) {
    add("braze_custom_attribute", m[1], m[0]);
  }
  for (const m of String(src).matchAll(/\{\{\s*\$\{(\w+)\}[^}]*\}\}/g)) {
    add("braze_personalisation", m[1], m[0]);
  }
  for (const m of String(src).matchAll(/\{\{\s*(?:person|event|organization)\.(\w+)\s*\}\}/g)) {
    add("klaviyo_property", m[1], m[0]);
  }
  return [...found.values()];
}

/** A fresh trace collector. */
export function newTrace() {
  return {
    arms: new Map(),
    taken: new Set(),
    unknownFilters: new Set(),
    unknownTags: new Set(),
  };
}

/**
 * Resolve a template to one concrete state.
 *
 * @param {string} html
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.attrs]  Personalisation name -> value.
 * @param {object} [opts.trace]                 From newTrace().
 * @param {string} [opts.fallback="sample"]     Value for an unbound token.
 */
export function resolveLiquid(html, opts = {}) {
  const attrs = opts.attrs ?? {};
  const trace = opts.trace ?? null;
  const fallback = opts.fallback ?? "sample";
  const bound = (name) =>
    Object.prototype.hasOwnProperty.call(attrs, name) ? String(attrs[name]) : null;

  let out = String(html);

  // 1. Personalisation tokens -> plain text, BEFORE the interpreter, so the
  //    template's own {% assign %}/{% capture %} guards read real values.
  out = out.replace(/\{\{\s*custom_attribute\.\$\{(\w+)\}\s*\}\}/g, (m, n) => bound(n) ?? "");
  out = out.replace(/\{\{\s*\$\{(\w+)\}[^}]*\}\}/g, (m, n) => bound(n) ?? fallback);
  out = out.replace(/\{\{\s*(?:person|event|organization)\.(\w+)\s*\}\}/g, (m, n) => bound(n) ?? fallback);
  out = out.replace(/\{\{\s*campaign\.\$\{(\w+)\}\s*\}\}/g, (m, n) => bound(n) ?? fallback);
  out = out.replace(/\{\{\s*content_blocks\.\$\{([a-z0-9_-]+)\}\s*\}\}/gi, (m, n) => bound(n) ?? "");

  // 2. The interpreter proper.
  out = evalBlock(tokenize(out), 0, {}, null, trace).out;

  // 3. Catch-all — nothing escapes to the DOM. An unresolved token is a long
  //    unbreakable string, and a render gate downstream would measure it as
  //    genuine overflow rather than as the bug it is.
  out = out.replace(/\{%[\s\S]*?%\}/g, "");
  out = out.replace(/\{\{[\s\S]*?\}\}/g, fallback);
  return out;
}

/** Count residual Liquid. A correct render leaves none. */
export function residualLiquid(html) {
  return (String(html).match(/\{[{%]/g) || []).length;
}
