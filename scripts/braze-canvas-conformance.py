#!/usr/bin/env python3
"""
braze-canvas-conformance — lint live Braze canvases against a naming/tagging convention.

READ-ONLY. Braze's REST API cannot mutate canvas config (verified 20 Aug 2026: /canvas/update,
/canvas/create and /canvas/step/update all return 404 "Invalid URL", while a bad key returns 401
and a real-but-misused endpoint returns 400 — three distinct signatures). Every fix this script
emits is therefore a dashboard action, driven per the `braze-claude-in-chrome-build` skill.

Usage:
    export BRAZE_API_KEY=...            # or --key
    python3 braze-canvas-conformance.py --endpoint rest.iad-07.braze.com
    python3 braze-canvas-conformance.py --config sophiie.json --json
    python3 braze-canvas-conformance.py --status all        # include stopped/archived

Exit codes: 0 = clean, 1 = findings, 2 = usage/transport error.
"""
import argparse, json, os, re, sys, urllib.request, urllib.error

DEFAULT_CONFIG = {
    "name_pattern": "^[A-Za-z0-9][A-Za-z0-9_.\\-]*$",
    "name_forbid": {" ": "space", ":": "colon"},
    "tag_axes": {
        "message_class": ["Marketing", "Transactional"],
        "lifecycle_stage": ["Onboarding & Activation", "Engagement & Expansion", "Retention & Billing"],
    },
    # The program tag is the canvas name with underscores restored to spaces.
    # Names are underscored for analytics (a space becomes %20 in any label
    # encoder, and analytics needs a delimiter that cannot occur inside a
    # value). TAGS are a dashboard filter surface -- they never reach an
    # analytics label -- so they stay human-readable. Justin, 20 Aug 2026:
    # "make sure tags dont have underscores".
    "program_tag_is_canvas_name_despaced": True,
    "tags_forbid_underscore": True,
    "retired_tags": ["Action-Based", "All Markets", "Education", "English",
                     "GLOBAL", "Multi-Step", "Setup", "Welcome"],
    "step_pattern": "^[A-Za-z0-9][A-Za-z0-9_.\\-]*$",
    # Braze auto-generates these; they are not author-named and are exempt.
    "step_exempt_names": ["Control"],
    "step_default_pattern": "^Step( \\d+)?$",
}


def api(endpoint, path, key, params=None):
    url = f"https://{endpoint}{path}"
    if params:
        url += "?" + "&".join(f"{k}={v}" for k, v in params.items())
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:200]
        raise SystemExit(f"[transport] {path} -> HTTP {e.code}: {body}")
    except Exception as e:
        raise SystemExit(f"[transport] {path} -> {e}")


def check_canvas(d, cfg):
    """Return a list of (severity, code, message, fix) findings for one canvas."""
    f = []
    name = d.get("name") or ""
    tags = list(d.get("tags") or [])

    # --- C1/C2 name shape -------------------------------------------------
    for ch, label in cfg["name_forbid"].items():
        if ch in name:
            f.append(("FAIL", "NAME_CHAR",
                      f"name contains a {label}: {name!r}",
                      f"rename to {re.sub(r'[^A-Za-z0-9_.-]+', '_', name).strip('_')!r}"))
            break
    else:
        if not re.match(cfg["name_pattern"], name):
            f.append(("FAIL", "NAME_SHAPE", f"name does not match convention: {name!r}", "rename"))

    # --- C3 tag cardinality ----------------------------------------------
    axes = cfg["tag_axes"]
    n_expected = len(axes) + (1 if cfg.get("program_tag_is_canvas_name_despaced") else 0)
    if len(tags) != n_expected:
        f.append(("FAIL", "TAG_COUNT",
                  f"has {len(tags)} tags, convention requires exactly {n_expected}: {sorted(tags)}",
                  f"set tags to exactly one per axis + the program tag"))

    # --- C4 one value per axis -------------------------------------------
    for axis, vocab in axes.items():
        hits = [t for t in tags if t in vocab]
        if len(hits) == 0:
            f.append(("FAIL", f"TAG_MISSING_{axis.upper()}",
                      f"no {axis} tag (expected one of {vocab})", f"add the correct {axis} tag"))
        elif len(hits) > 1:
            f.append(("FAIL", f"TAG_MULTI_{axis.upper()}",
                      f"{len(hits)} {axis} tags: {hits} — the axis allows exactly one",
                      "remove all but one"))

    # --- C5 program tag == canvas name, de-underscored ---------------------
    if cfg.get("program_tag_is_canvas_name_despaced"):
        expected = name.replace("_", " ")
        vocab = {v for vals in axes.values() for v in vals}
        prog = [t for t in tags if t not in vocab and t not in cfg["retired_tags"]]
        if expected not in tags:
            f.append(("FAIL", "TAG_PROGRAM",
                      f"no program tag {expected!r} (canvas is {name!r}, candidates={prog})",
                      f"add tag {expected!r} — the canvas name with underscores as spaces"))

    # --- C5b tags must never carry underscores ----------------------------
    if cfg.get("tags_forbid_underscore"):
        underscored = [t for t in tags if "_" in t]
        if underscored:
            f.append(("FAIL", "TAG_UNDERSCORE",
                      f"tag(s) contain underscores: {underscored}",
                      "tags are a filter surface, not an analytics label — use spaces: "
                      + ", ".join(f"{t!r}->{t.replace('_',' ')!r}" for t in underscored)))

    # --- C6 retired tags --------------------------------------------------
    retired = [t for t in tags if t in cfg["retired_tags"]]
    if retired:
        f.append(("FAIL", "TAG_RETIRED",
                  f"carries retired tags: {retired}", "remove them"))

    # --- C7/C8 step names -------------------------------------------------
    exempt = set(cfg["step_exempt_names"])
    dflt = re.compile(cfg["step_default_pattern"])
    pat = re.compile(cfg["step_pattern"])
    bad_default, bad_shape = [], []
    for s in (d.get("steps") or []):
        sn = s.get("name") or ""
        if sn in exempt:
            continue
        if dflt.match(sn):
            bad_default.append(sn)
        elif not pat.match(sn):
            bad_shape.append(sn)
    if bad_default:
        f.append(("FAIL", "STEP_DEFAULT",
                  f"{len(bad_default)} step(s) still carry Braze's default name: "
                  f"{sorted(set(bad_default))}",
                  "name each step for what it does"))
    if bad_shape:
        f.append(("FAIL", "STEP_SHAPE",
                  f"{len(bad_shape)} step name(s) contain spaces or illegal characters",
                  "underscore them: " + ", ".join(
                      f"{n!r}->{re.sub(r'[^A-Za-z0-9_.-]+','_',n).strip('_')!r}"
                      for n in sorted(set(bad_shape))[:4]) +
                  (" …" if len(set(bad_shape)) > 4 else "")))
    return f


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--endpoint", default=os.environ.get("BRAZE_ENDPOINT", "rest.iad-07.braze.com"))
    ap.add_argument("--key", default=os.environ.get("BRAZE_API_KEY") or os.environ.get("BRAZE_REST_KEY"))
    ap.add_argument("--config", help="JSON convention file; merged over the built-in default")
    ap.add_argument("--status", default="draft,live",
                    help="draft,live (default) | all")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    if not a.key:
        raise SystemExit("[usage] no API key: set BRAZE_API_KEY or pass --key")

    cfg = dict(DEFAULT_CONFIG)
    if a.config:
        cfg.update(json.load(open(a.config)))

    want_all = a.status.strip().lower() == "all"
    listing = api(a.endpoint, "/canvas/list", a.key,
                  {"page": 0, "include_archived": "true" if want_all else "false"})

    report, n_fail = [], 0
    for c in listing.get("canvases", []):
        d = api(a.endpoint, "/canvas/details", a.key, {"canvas_id": c["id"]})
        state = ("archived" if d.get("archived") else
                 "draft" if d.get("draft") else
                 "live" if d.get("enabled") else "stopped")
        if not want_all and state not in ("draft", "live"):
            continue
        findings = check_canvas(d, cfg)
        n_fail += len(findings)
        report.append({"id": c["id"], "name": d.get("name"), "state": state,
                       "tags": sorted(d.get("tags") or []),
                       "steps": len(d.get("steps") or []),
                       "findings": [{"severity": s, "code": co, "message": m, "fix": fx}
                                    for s, co, m, fx in findings]})

    if a.json:
        print(json.dumps({"checked": len(report), "findings": n_fail, "canvases": report}, indent=2))
    else:
        for r in report:
            mark = "PASS" if not r["findings"] else f"{len(r['findings'])} FINDING(S)"
            print(f"\n{'='*78}\n{r['name']}  [{r['state']}]  {r['steps']} steps  — {mark}\n  {r['id']}")
            if r["tags"]:
                print(f"  tags: {r['tags']}")
            for fd in r["findings"]:
                print(f"  ✗ {fd['code']:22s} {fd['message']}")
                print(f"    → fix: {fd['fix']}")
        print(f"\n{'='*78}\nCHECKED {len(report)} canvases · {n_fail} findings")
        if n_fail:
            print("Braze REST cannot write canvas config — apply fixes in the dashboard per the\n"
                  "`braze-claude-in-chrome-build` skill, then re-run this script as the proof.")
    sys.exit(1 if n_fail else 0)


if __name__ == "__main__":
    main()
