---
name: braze-data-validation
description: >
  Use this skill when Orbit needs to verify that custom events and custom attributes
  referenced in a message plan or personalisation actually exist in the Braze instance.
  Trigger on "do these attributes exist in Braze?", "validate our data model", "check
  if this event is tracked", "what custom attributes are available?", or before launching
  any program that depends on specific user data fields.
---

# Braze Data Model Validation

Verify that the custom events and attributes your Orbit programs depend on actually exist in the live Braze instance.

---

## Tool

`orbit_validate_braze_data`

### Parameters
- `required_attributes` (string[]) — Attribute names to check, e.g., `["first_name", "plan_type", "trial_days_remaining"]`
- `required_events` (string[]) — Event names to check, e.g., `["purchase_completed", "signup_completed"]`

## What It Returns

- **Full list** of all custom events and attributes in the Braze instance
- **Validation results:** which required fields were found and which are missing
- **Actionable message:** clear list of what's missing and what to do about it

## When to Use

1. **Before building a message plan:** Verify that personalisation fields exist
2. **Before launching a Canvas:** Confirm trigger events are being tracked
3. **During program discovery:** List available data to inform what personalisation is possible
4. **After data migration:** Verify attributes carried over correctly
