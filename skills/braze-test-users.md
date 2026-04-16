---
name: braze-test-users
description: >
  Use this skill when the user needs to validate test user profiles in Braze before
  sending QA test messages. Trigger on "check my test users", "validate test user data",
  "does this user have the right attributes?", "check subscription status", or any
  request about QA readiness for specific Braze user profiles.
---

# Braze Test User Validation

Look up Braze user profiles by external ID or email to validate personalisation data, subscription status, and push token availability for QA.

---

## Tool

`orbit_validate_test_users`

### Parameters
- `user_ids` (string[]) — External IDs to look up
- `emails` (string[]) — Email addresses to look up

## What It Returns

For each user:
- External ID, email, first/last name
- Push subscription status and token count
- Email subscription status
- Custom attribute count and populated field names
- Missing common personalisation fields (e.g., `first_name`, `email`)
- Subscription group memberships

Plus overall QA readiness: `ready` or `needs_attention`.

## QA Checklist Pattern

For thorough QA, look up these user types:
1. **Happy-path user** — has all personalisation data populated
2. **Worst-case user** — missing profile data, tests fallback logic
3. **Converted user** — should trigger Canvas exit criteria
4. **Suppressed user** — unsubscribed or consent-blocked
5. **Holdout/control user** — in the control group
