# Stripo `values` field probe — findings
Generated: 2026-05-08T03:37:23.433Z
## Purpose
Empirical validation of Stripo's `values` field on POST /email before
committing to slot-aware overrides (Path A) in orbit_compose_stripo_email.
## Args
- module-a override: (auto-pick)
- module-b override: (auto-pick)
## Probe results
### List modules
**Status:** fail
```
GET /modules failed: HTTP 401 — {"timestamp":"2026-05-08T03:37:23.326Z","status":401,"error":"Unauthorized","path":"/v1/modules"}
```
## Verdict
_Fill in after reviewing results above:_
- **Does `values` work at all?** [pass/fail/partial]
- **Where does it live?** [per-module entry / top-level / both / neither]
- **HTML escape behaviour?** [escapes / preserves / depends on slot type]
- **Empty string behaviour?** [renders empty / falls back to default]
- **Liquid passthrough?** [literal / substituted / escaped]
- **Unknown slot key?** [errors / silently ignored]
- **Rendered HTML fetch endpoint?** [confirmed / not available]
## Decision
- ✅ **Proceed with implementation per the plan**
- ⚠️ **Update the plan and re-confirm with Sir**
- ❌ **Stop. Ship Path B (paste-in flow) instead**