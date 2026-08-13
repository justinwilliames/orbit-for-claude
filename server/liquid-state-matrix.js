/**
 * Liquid branch coverage — render EVERY personalisation state, not just the
 * one the author's sample data happened to hold.
 *
 * A personalised email is not one email. It is 2^n emails, and almost every
 * pre-send gate in existence checks exactly one of them: whichever state the
 * sample map was carrying. The defects that hide in the others are the ones
 * that cannot be seen in production — the state most recipients land in is
 * SELF-TESTING, because everyone sees it and a bug surfaces the same day, while
 * the rarer states ship silently and stay silent until a customer trips one.
 *
 * The failure shapes this catches, each observed in a real programme:
 *   · a conditional hoisted so one arm is unreachable BY CONSTRUCTION.
 *     Eighteen gate stages green, twice.
 *   · two mutually exclusive proof modules pointed at the SAME arm, so one
 *     whole population receives an email with no argument in it. The gate
 *     verdict was byte-identical before and after the defect was introduced.
 *   · a resolver silently dropping an unmodelled tag, so its body rendered
 *     unconditionally in every state measured.
 *   · two truthiness parsers on one attribute disagreeing on the string "True".
 *
 * FIVE INVARIANTS, asserted in every state:
 *   A  residual Liquid == 0                — nothing raw escapes to the DOM.
 *   B  no unmodelled filter or tag         — fail loud, never quietly wrong.
 *   C  no state collapses the email        — a body floor.
 *   C2 no state's block set is a STRICT PROPER SUBSET of another's.
 *   H  every registered conditional arm is taken in at least one state.
 *
 * Plus one that needs no enumeration:
 *   G  spelling agreement — the same attribute under "true", "True", "TRUE",
 *      "1" and " true " produces ONE branch decision, not two.
 *
 * C2 is H's blind spot and it earned its place. H asks whether an arm CAN
 * fire; it never asks what the reader is left with when it does not. Point two
 * mutually exclusive modules at the same arm and every arm is still reachable,
 * the body still clears C's floor, and one population gets nothing. The exact
 * relation is SUBSET: a legitimate SWAP leaves each arm something the other
 * lacks, so neither set contains the other. A DROP gives one population
 * strictly less than another's, plus nothing. That needs no threshold.
 *
 * No credentials, no browser, pure string work.
 */

import { resolveLiquid, residualLiquid, newTrace, personalisationTokens, tokenize } from "./liquid-resolve.js";

/** Default block detector: any element carrying a module/block/section class. */
const DEFAULT_BLOCK_SELECTOR = "(?:module|block|section)-[a-z0-9-]+";

/**
 * The five spellings invariant G feeds an attribute. Every real templating
 * stack has at least two places that decide what "on" means, and they disagree
 * on exactly these.
 */
const TRUTHY_SPELLINGS = ["true", "True", "TRUE", "1", " true "];

/** Minimum rendered characters before a state counts as collapsed. */
const BODY_FLOOR = 400;

/** Cap on comparison literals promoted into one axis's value set. */
const MAX_HARVESTED_VALUES = 5;

/** Values that mean an attribute is being used as an on/off flag. */
const FLAG_SPELLINGS = new Set(["true", "false", "True", "False", "TRUE", "FALSE", "1", "0", ""]);

/**
 * Run the matrix.
 *
 * @param {object} args
 * @param {string} args.html               Compiled email HTML with Liquid intact.
 * @param {Record<string,string[]>} [args.variables]
 *        Explicit axis values, keyed by personalisation name. Anything not
 *        listed gets ["true","false"].
 * @param {number} [args.max_axes=12]      Cap on discovered axes.
 * @param {string} [args.block_selector]   Regex source for the block-class
 *        detector, so an imported design with its own naming still works.
 * @param {boolean} [args.self_test=false] Run the negative test instead: seed
 *        known defects into the supplied template and assert each one FAILS.
 */
export function liquidStateMatrix({
  html,
  variables,
  max_axes: maxAxes = 12,
  block_selector: blockSelector,
  self_test: selfTest = false,
} = {}) {
  if (typeof html !== "string" || html.trim().length === 0) {
    return {
      status: "needs_inputs",
      missing: ["html"],
      message:
        "Provide the COMPILED email HTML with its Liquid still in place. " +
        "Compile first (orbit_compile_email_template), do not strip the tags — " +
        "a stripped template has no branches left to enumerate.",
    };
  }

  if (selfTest) return runSelfTest({ html, variables, maxAxes, blockSelector });

  const axes = discoverAxes(html, variables);
  if (axes.length === 0) {
    return {
      status: "ok",
      verdict: "no_branches",
      axes: [],
      message:
        "No personalisation binding drives a conditional in this template, so " +
        "there is exactly one state and nothing to enumerate. That is a fact " +
        "about the template, not a pass — if you expected branches, check that " +
        "you passed the COMPILED html with Liquid intact rather than a resolved render.",
    };
  }

  // The cap is on STATES, not axes. Axis value sets are derived from the
  // literals each attribute is compared against, so three axes can be a
  // larger sweep than six booleans, and counting axes would let the expensive
  // case through while blocking the cheap one.
  const stateCount = axes.reduce((n, a) => n * Math.max(1, a.values.length), 1);
  const stateCap = 2 ** maxAxes;
  if (axes.length > maxAxes || stateCount > stateCap) {
    // Sampling would produce a confident verdict on a fraction of the space
    // and call it coverage. Abstain and name the number instead.
    return {
      status: "needs_inputs",
      verdict: "too_many_axes",
      axes: axes.map((a) => ({ name: a.name, values: a.values })),
      states_required: stateCount,
      states_cap: stateCap,
      message:
        `${axes.length} personalisation axes across their discovered value sets means ` +
        `${stateCount} states, above the cap of ${stateCap} implied by max_axes=${maxAxes}. ` +
        "Nothing was checked — a partial sweep reported as coverage is the failure this " +
        "tool exists to catch. Either raise max_axes deliberately, or pin the axes you " +
        "are not testing by passing them in `variables` with a single value each.",
    };
  }

  const blockRe = new RegExp(`class="[^"]*\\b(${blockSelector ?? DEFAULT_BLOCK_SELECTOR})`, "g");
  const states = enumerateStates(axes);
  const trace = newTrace();
  const results = [];
  const findings = [];

  for (const state of states) {
    const rendered = resolveLiquid(html, { attrs: state.attrs, trace });
    const residual = residualLiquid(rendered);
    const text = visibleText(rendered);
    const blocks = blockSet(rendered, blockRe);

    // A — residual Liquid.
    //
    // This can only fire on Liquid the TOKENIZER could not reach: an
    // unterminated tag, a token one brace short. Anything syntactically whole
    // is scrubbed by resolveLiquid's catch-all before it gets here, which is
    // why the honest half of invariant A is the swallowed-output check below
    // rather than a grep of an already-scrubbed string.
    if (residual > 0) {
      findings.push({
        invariant: "A",
        check: "residual_liquid",
        severity: "fail",
        state: state.label,
        message: `${residual} Liquid token(s) survived into the DOM in state "${state.label}". A recipient would see them.`,
      });
    }

    // C — collapse.
    if (text.length < BODY_FLOOR) {
      findings.push({
        invariant: "C",
        check: "state_collapses",
        severity: "fail",
        state: state.label,
        message:
          `State "${state.label}" renders ${text.length} characters of visible copy ` +
          `(floor ${BODY_FLOOR}). Some population receives a near-empty email.`,
      });
    }

    results.push({ label: state.label, attrs: state.attrs, blocks, chars: text.length });
  }

  // B — unmodelled constructs. Reported ONCE, not per state.
  if (trace.unknownFilters.size > 0) {
    findings.push({
      invariant: "B",
      check: "unmodelled_filter",
      severity: "fail",
      message:
        `Unmodelled Liquid filter(s): ${[...trace.unknownFilters].join(", ")}. ` +
        "Every verdict above was computed on a value the resolver did not " +
        "understand, so none of them mean anything. This is deliberately a " +
        "failure rather than a silent best-effort render.",
    });
  }
  // A/B — outputs the resolver could not model. Before this they were
  // rewritten to the fallback word and counted as body copy: invisible to
  // residualLiquid (which reads the scrubbed string), invisible to
  // personalisationTokens, and therefore never an axis. An output nobody
  // modelled is an unmeasured branch exactly like an unmodelled tag.
  if (trace.unknownOutputs.size > 0) {
    const shown = [...trace.unknownOutputs].slice(0, 6);
    findings.push({
      invariant: "B",
      check: "unmodelled_output",
      severity: "fail",
      message:
        `Unmodelled output token(s): ${shown.join(", ")}` +
        (trace.unknownOutputs.size > shown.length ? ` (+${trace.unknownOutputs.size - shown.length} more)` : "") +
        ". Each was rewritten to placeholder text before the checks ran, so it " +
        "counted as body copy, never became an axis, and whatever it would " +
        "resolve to at send time was never varied. Either it is a binding " +
        "shape this resolver does not know, or it is a genuinely unbound " +
        "token your recipients would see raw.",
    });
  }
  if (trace.unknownTags.size > 0) {
    findings.push({
      invariant: "B",
      check: "unmodelled_tag",
      severity: "fail",
      message:
        `Unmodelled Liquid tag(s): ${[...trace.unknownTags].join(", ")}. ` +
        "An unmodelled tag is dropped, which leaves its BODY inline " +
        "unconditionally — so the states above render a shape your ESP will " +
        "never send.",
    });
  }

  // H — dead arms, and the arms this run simply never had a value for.
  //
  // These are different sentences and collapsing them was the bug. Default
  // axis values are ["true","false"], so an arm comparing an attribute to a
  // string literal — `== 'FREE'` — was never taken by construction of the
  // VALUE SET, not of the template, and got reported at severity fail with
  // "the copy inside it will never be sent to anyone". discoverAxes now
  // harvests those literals, so the residual case is an arm testing something
  // outside anything we enumerated: a warning to supply values, not a defect.
  const tested = new Set();
  for (const axis of axes) for (const v of axis.values) tested.add(String(v));
  // Only an axis whose values this tool GUESSED can excuse an untaken arm. A
  // caller who passed `variables` declared the space they want checked, and
  // an arm unreachable inside it is dead inside it.
  const guessed = axes.filter((a) => a.values_source !== "supplied");
  for (const [key, arm] of trace.arms) {
    if (trace.taken.has(key)) continue;
    const untried = untriedLiterals(arm, guessed).filter((lit) => !tested.has(lit));
    const label = arm.source === arm.resolved
      ? `\`${arm.source}\``
      : `\`${arm.source}\` (resolved to \`${arm.resolved}\` under this value set)`;
    if (untried.length > 0) {
      findings.push({
        invariant: "H",
        check: "arm_untested",
        severity: "warn",
        arm: key,
        message:
          `Conditional arm ${label} was taken in none of the ${states.length} states, but it ` +
          `tests ${untried.map((l) => JSON.stringify(l)).join(", ")}, which no axis was given. ` +
          "This run did not prove the arm dead — it never fed it a value that could take it. " +
          "Pass the real value set in `variables` and re-run before believing either answer.",
      });
      continue;
    }
    findings.push({
      invariant: "H",
      check: "dead_arm",
      severity: "fail",
      arm: key,
      message:
        `Conditional arm ${label} was taken in NONE of the ${states.length} states, across every ` +
        "value it tests. It is unreachable by construction — the copy inside it will never be " +
        "sent to anyone.",
    });
  }

  // C2 — strict proper subsets, on MUTUALLY EXCLUSIVE axes only.
  //
  // The scoping is the whole check. Compared across every pair of states, a
  // subset relation is the NORMAL shape of an `{% if %}` with no `{% else %}`:
  // the flag-off population legitimately gets one module fewer. Firing there
  // would put this check in the same bin as a gate that warns on 480px and
  // 600px — right about the arithmetic, wrong about every real input, and
  // therefore ignored.
  //
  // It fires only where the author wrote an `{% else %}` or `{% elsif %}`.
  // That is them saying both populations get something comparable, and a
  // strict subset is then a DROP where a SWAP was intended: everything the
  // fuller arm had, minus what vanished, plus nothing.
  findings.push(...checkExclusiveSubsets({ results, axes }));

  // G — spelling agreement.
  findings.push(...checkSpellingAgreement({ html, axes, blockRe }));

  const fails = findings.filter((f) => f.severity === "fail");
  const drawn = drawableStates(results, findings);
  return {
    status: "ok",
    verdict: fails.length === 0 ? "pass" : "fail",
    // The per-state block sets, which every check above is computed FROM
    // and which were previously thrown away at this line.
    //
    // They are the only representation in which a C2 subset is obvious
    // rather than argued: the reader sees one row missing a column its
    // sibling has. Emitted as a shared block dictionary plus per-state
    // indices because the naive shape — a repeated array of class names
    // per state — is quadratic in a tool whose whole premise is 2^n.
    block_catalogue: drawn.catalogue,
    states: drawn.states,
    states_shown: drawn.states.length,
    axes: axes.map((a) => ({
      name: a.name,
      dialect: a.dialect,
      values: a.values,
      // Where the values came from matters as much as what they are: a
      // "boolean_default" axis on a template that compares strings is the
      // tool guessing, and the reader should supply `variables` instead.
      values_source: a.values_source,
      exclusive: a.exclusive,
    })),
    states_rendered: states.length,
    arms: { registered: trace.arms.size, taken: trace.taken.size },
    findings,
    summary: {
      failures: fails.length,
      by_invariant: fails.reduce((acc, f) => {
        acc[f.invariant] = (acc[f.invariant] ?? 0) + 1;
        return acc;
      }, {}),
      headline:
        fails.length === 0
          ? `All ${states.length} personalisation states render, every conditional arm is reachable, and no state is a strict subset of another.`
          : `${fails.length} failure(s) across ${states.length} states. A state nobody has rendered is a state nobody has checked.`,
    },
    message:
      "Branch coverage only — this says nothing about whether a token resolved " +
      "to the RIGHT value at send time. A live multi-state test cohort in your " +
      "ESP still owns that.",
  };
}

// ---------------------------------------------------------------------------
// Axis discovery
// ---------------------------------------------------------------------------

/**
 * Derive the axis set FROM THE TEMPLATE, never from a fixed list.
 *
 * A fixed list is a list somebody has to remember to extend, and the one this
 * technique came from skipped five of eight sends in a programme — including
 * the only one carrying the audience split — while printing PASS the whole
 * time. An axis is any personalisation token the template BRANCHES on, whether
 * it does so directly in a condition or via an `{% assign %}` / `{% capture %}`
 * that reads it. Keyed on the binding; naming conventions rot.
 */
export function discoverAxes(html, variables) {
  const tokens = personalisationTokens(html);
  if (tokens.length === 0) return [];

  const byName = new Map(tokens.map((t) => [t.name, t]));
  const branching = new Set();

  // (1) Variables bound from a personalisation token, then branched on.
  const boundVars = new Map(); // liquid var name -> attribute name
  for (const m of String(html).matchAll(/\{%\s*assign\s+(\w+)\s*=\s*([^%]+?)%\}/g)) {
    const attr = tokenNameIn(m[2], byName);
    if (attr) boundVars.set(m[1], attr);
  }
  for (const m of String(html).matchAll(/\{%\s*capture\s+(\w+)\s*%\}([\s\S]*?)\{%\s*endcapture\s*%\}/g)) {
    const attr = tokenNameIn(m[2], byName);
    if (attr) boundVars.set(m[1], attr);
  }

  // Bound variables chain: `assign a_n = a_raw | strip`. Walk one level of
  // indirection so the axis lands on the attribute, not the intermediate.
  for (const m of String(html).matchAll(/\{%\s*assign\s+(\w+)\s*=\s*([^%]+?)%\}/g)) {
    const rhsHead = m[2].trim().split("|")[0].trim();
    if (boundVars.has(rhsHead) && !boundVars.has(m[1])) {
      boundVars.set(m[1], boundVars.get(rhsHead));
    }
  }

  // (2) Walk every condition tag and see which names it reads. An axis whose
  //     block carries an else/elsif arm is MUTUALLY EXCLUSIVE — the author has
  //     said both populations get something. Invariant C2 needs that
  //     distinction and nothing else can supply it.
  const exclusive = new Set();
  // Value literals harvested per attribute. An axis's default value set is
  // what its own conditions compare against, not a hardcoded pair of booleans.
  const harvested = new Map();
  const toks = tokenize(html);
  for (let i = 0; i < toks.length; i += 1) {
    const tok = toks[i];
    if (tok.t !== "tag") continue;
    const verb = tok.v.split(/\s+/)[0];
    if (verb !== "if" && verb !== "unless" && verb !== "elsif") continue;
    const condition = tok.v.replace(/^(if|unless|elsif)\s+/, "");

    const reads = new Set(tokenNamesIn(condition, byName));
    for (const [varName, attr] of boundVars) {
      if (new RegExp(`\\b${varName}\\b`).test(condition)) reads.add(attr);
    }
    for (const name of reads) branching.add(name);

    // Only harvest when the condition reads exactly one attribute — with two,
    // there is no way to tell which literal belongs to which without a parser.
    if (reads.size === 1) {
      const [name] = [...reads];
      if (!harvested.has(name)) harvested.set(name, new Set());
      for (const lit of literalsIn(condition)) harvested.get(name).add(lit);
    }

    if (reads.size > 0 && verb !== "elsif" && hasElseArm(toks, i)) {
      for (const name of reads) exclusive.add(name);
    }
  }

  const supplied = variables && typeof variables === "object" ? variables : {};

  // An explicitly supplied variable is an axis even if this discovery pass
  // missed it — the caller knows something we do not, and their word wins.
  for (const name of Object.keys(supplied)) {
    if (byName.has(name) || String(html).includes(name)) branching.add(name);
  }

  return [...branching].sort().map((name) => {
    const explicit = Array.isArray(supplied[name]) && supplied[name].length > 0;
    // The literals this attribute is actually compared against, plus "" for
    // the unset population that falls through to the else arm. Capped so one
    // heavily-switched attribute cannot silently explode the cartesian.
    const found = [...(harvested.get(name) ?? [])].slice(0, MAX_HARVESTED_VALUES);
    // An attribute compared only against flag spellings IS a flag, whether or
    // not a literal was harvested — so it keeps the boolean pair and stays
    // eligible for invariant G. Anything else gets the values the template
    // actually names, plus "" for the unset population that falls through.
    const flagLike = found.every((v) => FLAG_SPELLINGS.has(v));
    return {
      name,
      dialect: byName.get(name)?.dialect ?? "supplied",
      values: explicit ? supplied[name].map(String) : flagLike ? ["true", "false"] : [...found, ""],
      values_source: explicit ? "supplied" : flagLike ? "boolean_flag" : "harvested",
      exclusive: exclusive.has(name),
      // Invariant G only makes sense on a flag. Feeding "true"/"True"/"1" to
      // an axis the caller has told us holds gold/silver/bronze tests nothing
      // and reports a disagreement that is just the tool misreading the type.
      boolean_like: !explicit && flagLike,
    };
  });
}

/**
 * The literals an untaken arm tests AGAINST AN AXIS, ignoring the rest.
 *
 * The distinction is what keeps `{% if x and 'a' == 'b' %}` a genuine dead
 * arm: a comparison between two constants is decidable without varying
 * anything, so it can never be the value set's fault. Only a clause that
 * names an axis can excuse the arm.
 */
function untriedLiterals(arm, axes) {
  if (axes.length === 0) return [];
  const out = new Set();
  for (const text of [arm.source, arm.resolved]) {
    for (const clause of String(text).split(/\s+(?:and|or)\s+/)) {
      if (!axes.some((a) => new RegExp(`\\b${a.name}\\b`).test(clause))) continue;
      for (const lit of literalsIn(clause)) out.add(lit);
    }
  }
  return [...out];
}

/**
 * Every value a condition compares against, as strings.
 *
 * This is what turns the default ["true","false"] axis from a value space into
 * a source of phantom dead arms: an arm reading `== 'FREE'` cannot be taken by
 * a run that only ever fed the attribute "true" and "false", and reporting
 * that as "unreachable by construction" is a confident sentence about the
 * template built entirely out of the tool's own defaults.
 *
 * Numeric comparands come back with their neighbours so BOTH sides of a
 * `> 0` / `>= 5` are reachable — one value is a comparison, two are a branch.
 */
export function literalsIn(condition) {
  const out = new Set();
  for (const m of String(condition).matchAll(/(?:==|!=|contains)\s*(?:'([^']*)'|"([^"]*)")/g)) {
    out.add(m[1] ?? m[2]);
  }
  for (const m of String(condition).matchAll(/(?:>=|<=|>|<|==|!=)\s*(-?\d+)\b/g)) {
    const n = Number(m[1]);
    out.add(String(n));
    out.add(String(n + 1));
    out.add(String(n - 1));
  }
  return [...out];
}

/** Does the `if`/`unless` block opening at `i` carry an else/elsif at depth 0? */
function hasElseArm(toks, i) {
  const negate = toks[i].v.split(/\s+/)[0] === "unless";
  const closer = negate ? "endunless" : "endif";
  let depth = 0;
  for (let j = i + 1; j < toks.length; j += 1) {
    if (toks[j].t !== "tag") continue;
    const verb = toks[j].v.split(/\s+/)[0];
    if (verb === "if" || verb === "unless" || verb === "capture") depth += 1;
    else if (verb === "endif" || verb === "endunless" || verb === "endcapture") {
      if (depth > 0) depth -= 1;
      else if (verb === closer) return false;
    } else if (depth === 0 && (verb === "else" || verb === "elsif")) {
      return true;
    }
  }
  return false;
}

/**
 * EVERY personalisation name referenced in `text`.
 *
 * Returning only the first was a quiet coverage hole: `{% if a and b %}` made
 * `a` an axis and left `b` unvaried, so half the condition was never exercised
 * and the run still reported full branch coverage.
 */
function tokenNamesIn(text, byName) {
  const out = [];
  for (const [name, token] of byName) {
    if (String(text).includes(token.token)) { out.push(name); continue; }
    // A token can appear with different whitespace than the one we captured.
    if (new RegExp(`\\$\\{${name}\\}|\\b(?:person|event|organization)\\.${name}\\b`).test(text)) {
      out.push(name);
    }
  }
  return out;
}

/** The first personalisation name referenced anywhere in `text`. */
function tokenNameIn(text, byName) {
  return tokenNamesIn(text, byName)[0] ?? null;
}

/** Full cartesian product across the axes. */
function enumerateStates(axes) {
  let states = [{ attrs: {}, on: [] }];
  for (const axis of axes) {
    const next = [];
    for (const state of states) {
      for (const value of axis.values) {
        next.push({
          attrs: { ...state.attrs, [axis.name]: value },
          on: value === "false" || value === "0" || value === "" ? state.on : [...state.on, `${axis.name}=${value}`],
        });
      }
    }
    states = next;
  }
  return states.map((s) => ({ ...s, label: s.on.length ? s.on.join("+") : "none" }));
}

// ---------------------------------------------------------------------------
// Invariant C2 — a drop where a swap was intended
// ---------------------------------------------------------------------------

function checkExclusiveSubsets({ results, axes }) {
  const exclusive = axes.filter((a) => a.exclusive);
  if (exclusive.length === 0) return [];

  const findings = [];
  const seen = new Set();
  for (const axis of exclusive) {
    for (let i = 0; i < results.length; i += 1) {
      for (let j = 0; j < results.length; j += 1) {
        if (i === j) continue;
        if (!differsOnlyOn(results[i].attrs, results[j].attrs, axis.name)) continue;
        if (!isProperSubset(results[i].blocks, results[j].blocks)) continue;
        if (seen.has(axis.name)) continue;
        seen.add(axis.name);
        findings.push({
          invariant: "C2",
          check: "arm_drops_instead_of_swaps",
          severity: "fail",
          axis: axis.name,
          state: results[i].label,
          message:
            `Flipping "${axis.name}" alone takes state "${results[i].label}" to a ` +
            `strict subset of "${results[j].label}" — it loses ` +
            `${[...results[j].blocks].filter((b) => !results[i].blocks.has(b)).join(", ")} ` +
            "and gains nothing. This branch has an else/elsif arm, so both " +
            "populations are meant to get something comparable; one of them is " +
            "receiving an email with a hole in it. Every arm is still reachable, " +
            "the body still clears the collapse floor, and no other check sees this.",
        });
      }
    }
  }
  return findings;
}

function differsOnlyOn(a, b, name) {
  if (a[name] === b[name]) return false;
  for (const key of Object.keys(a)) {
    if (key !== name && a[key] !== b[key]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Invariant G — spelling agreement
// ---------------------------------------------------------------------------

/**
 * Feed each axis the five spellings of "on" and assert one branch decision.
 *
 * The cheapest high-value check on the list. Two truthiness parsers on one
 * attribute — one comparing to the literal 'true', one normalising with
 * `| strip | downcase` — agree on every value except the ones a real CRM
 * actually stores. All other axes are pinned "false" so the only thing moving
 * is the spelling.
 */
function checkSpellingAgreement({ html, axes, blockRe }) {
  const findings = [];
  for (const axis of axes) {
    if (!axis.boolean_like) continue;
    const base = {};
    for (const other of axes) base[other.name] = "false";

    const seen = new Map(); // block-set signature -> spellings that produced it
    for (const spelling of TRUTHY_SPELLINGS) {
      const rendered = resolveLiquid(html, { attrs: { ...base, [axis.name]: spelling } });
      const signature = [...blockSet(rendered, blockRe)].sort().join("|");
      if (!seen.has(signature)) seen.set(signature, []);
      seen.get(signature).push(JSON.stringify(spelling));
    }

    if (seen.size > 1) {
      findings.push({
        invariant: "G",
        check: "spelling_disagreement",
        severity: "fail",
        axis: axis.name,
        message:
          `"${axis.name}" produces ${seen.size} different renders across the ` +
          `spellings ${[...seen.values()].map((g) => g.join("/")).join(" vs ")}. ` +
          "Two places in this template decide what 'on' means and they " +
          "disagree — normalise the value once (`| strip | downcase`) and " +
          "compare against that, in every arm.",
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function visibleText(html) {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function blockSet(html, blockRe) {
  const out = new Set();
  blockRe.lastIndex = 0;
  let m;
  while ((m = blockRe.exec(html))) out.add(m[1]);
  return out;
}

function isProperSubset(a, b) {
  return a.size < b.size && [...a].every((x) => b.has(x));
}

/** Cap on states carried out for drawing. The CHECKS always run on all. */
const MAX_DRAWN_STATES = 128;

/**
 * The per-state block sets, as a shared catalogue plus indices.
 *
 * Two rules:
 *
 *   1. Every state a finding NAMES is kept, whatever the cap. Truncating
 *      in enumeration order alone would routinely drop the one row the
 *      reader was sent here to look at — the enumeration is a cartesian
 *      product, so a failing state is as likely to be state 900 as state
 *      2, and a grid that silently omits it is worse than no grid.
 *   2. What was dropped is COUNTED, never implied. `states_rendered`
 *      stays the true total; the difference is the omission, and the
 *      widget says so above the grid rather than presenting a partial
 *      sweep as the whole space.
 */
function drawableStates(results, findings) {
  const named = new Set(findings.map((f) => f.state).filter(Boolean));
  const keep = [];
  for (const r of results) if (named.has(r.label)) keep.push(r);
  for (const r of results) {
    if (keep.length >= MAX_DRAWN_STATES) break;
    if (!named.has(r.label)) keep.push(r);
  }
  // Back into enumeration order — the axis sweep is the only ordering in
  // which neighbouring rows differ by one flag, which is what makes a
  // dropped module legible as a gap rather than as noise.
  const order = new Map(results.map((r, i) => [r.label, i]));
  keep.sort((a, b) => order.get(a.label) - order.get(b.label));

  const catalogue = [];
  const index = new Map();
  for (const r of keep) {
    for (const b of r.blocks) {
      if (!index.has(b)) {
        index.set(b, catalogue.length);
        catalogue.push(b);
      }
    }
  }
  catalogue.sort();
  catalogue.forEach((b, i) => index.set(b, i));

  return {
    catalogue,
    states: keep.map((r) => ({
      label: r.label,
      attrs: r.attrs,
      chars: r.chars,
      present: [...r.blocks].map((b) => index.get(b)).sort((a, b) => a - b),
    })),
  };
}

// ---------------------------------------------------------------------------
// The negative test — part of the tool, not just of the test suite
// ---------------------------------------------------------------------------

/**
 * Seed a known defect into the supplied template and assert the matrix FAILS
 * on it.
 *
 * A check nobody has watched fail is not evidence of anything. And the second
 * half matters as much as the first: a mutation built with .replace() that
 * stops matching returns the control UNCHANGED, so the case silently stops
 * testing its defect and reports whatever the control reports. Every seed is
 * asserted to have LANDED before its verdict is read — a mutation that quietly
 * stopped applying is a test that reports PASS while testing nothing, which is
 * the same defect this tool hunts, one level up.
 */
function runSelfTest({ html, variables, maxAxes, blockSelector }) {
  const run = (body) =>
    liquidStateMatrix({ html: body, variables, max_axes: maxAxes, block_selector: blockSelector });

  const control = run(html);
  const hasIf = /\{%\s*if\s+/.test(html);
  const hasAssign = /\{%\s*assign\s+\w+\s*=/.test(html);

  const cases = [
    {
      label: "CONTROL (unmutated)",
      body: html,
      expect: "pass",
      control: true,
    },
    {
      label: "an arm gated on an impossible condition (dead by construction)",
      requires: hasIf ? null : "no {% if %} in this template",
      // Narrow the FIRST condition with a clause nothing can satisfy. Its arm
      // becomes unreachable in every state while every other arm is untouched,
      // which is the hoisted-conditional shape exactly.
      body: html.replace(/\{%\s*if\s+([\s\S]*?)%\}/, "{% if $1 and 'x' == 'y' %}"),
      expect: "fail",
    },
    {
      label: "an unmodelled Liquid tag is dropped -> FAIL, never a silent render",
      requires: hasIf ? null : "no {% if %} in this template",
      body: html.replace(/\{%\s*if\s+/, "{% mystery_tag %}{% if "),
      expect: "fail",
    },
    {
      label: "an unmodelled filter -> FAIL, never a plausible render off a junk value",
      requires: hasAssign ? null : "no {% assign %} in this template",
      body: html.replace(/(\{%\s*assign\s+\w+\s*=[\s\S]*?)%\}/, "$1| mystery_filter %}"),
      expect: "fail",
    },
  ];

  const rows = [];
  let broken = 0;
  for (const c of cases) {
    // A seed for a construct the template does not contain is SKIPPED and
    // named. A seed whose construct IS present but that changed nothing is
    // BROKEN — the two are different sentences and collapsing them is how a
    // mutation quietly stops applying and the harness keeps printing green.
    if (c.requires) {
      rows.push({ case: c.label, outcome: "SKIPPED", detail: c.requires });
      continue;
    }
    if (!c.control && c.body === html) {
      broken += 1;
      rows.push({
        case: c.label,
        outcome: "BROKEN",
        detail: "the seed did not apply — this case is testing nothing",
      });
      continue;
    }
    const result = run(c.body);
    const got = result.verdict === "pass" ? "pass" : "fail";
    const ok = got === c.expect;
    if (!ok) broken += 1;
    rows.push({
      case: c.label,
      outcome: ok ? "PASS" : "BROKEN",
      expected: c.expect,
      got,
      detail: ok ? null : "the check did not behave as the seeded defect requires",
    });
  }

  return {
    status: "ok",
    mode: "self_test",
    verdict: broken === 0 ? "pass" : "fail",
    control_verdict: control.verdict,
    cases: rows,
    message:
      broken === 0
        ? "Every seeded defect was caught and the unmutated control passed. " +
          "Both directions matter: a check that only ever passes and a check " +
          "that only ever fails are equally worthless."
        : `${broken} case(s) BROKEN. A seed that did not apply, or a check that ` +
          "did not fire, means the matrix is reporting on something other than " +
          "what you think.",
  };
}
