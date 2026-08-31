# Braze API Key Permissions

Braze scopes REST API keys per endpoint. Each permission is an individual checkbox on the key, set
at creation time and immutable afterwards — if a key is missing a scope you must create a new key.
A key that is valid but unscoped for the endpoint you call returns `401`, which is easy to misread
as a bad credential.

This page is the canonical list for Orbit. Skills and server modules that name a permission inline
should agree with it.

## Provenance

Verified against the Braze dashboard `Settings > APIs and Identifiers > API Keys > Create API key`
on 31 August 2026.

**Braze's published permission reference lags the dashboard.** At time of writing the docs page
omitted `campaigns.duplicate`, `campaigns.translations.get`, `campaigns.translations.update`, the
whole Apps and News Feed sections, and `events.get` — all of which are live checkboxes. Treat the
dashboard as the source of truth and this file as a snapshot of it, not the docs.

## The read/write test

When a permission appears that is not listed below, classify it by its verb rather than guessing.

Read: `list`, `get`, `details`, `info`, `data_series`, `data_summary`, `export.*`.

Write: `send`, `trigger.*`, `create`, `update`, `delete`, `duplicate`, `set`, `remove`, `sync`,
`track`, `merge`, `identify`, `rename`, `replace`, `add_items`, `primary`.

This test classifies every checkbox in the current dashboard correctly, including the ones absent
from Braze's own documentation, which is why it is worth applying instead of trusting a list.

## Read-only key

Everything below is a read. A key holding only these scopes cannot send a message, mutate a user,
or change any configuration.

| Section | Read permissions |
|---|---|
| Apps | `apps.get` |
| Campaigns | `campaigns.list`, `campaigns.details`, `campaigns.data_series`, `campaigns.url_info.details`, `campaigns.translations.get`, `sends.data_series` |
| Canvas | `canvas.list`, `canvas.details`, `canvas.data_series`, `canvas.data_summary`, `canvas.url_info.details`, `canvas.translations.get` |
| Catalogs | `catalogs.get`, `catalogs.get_item`, `catalogs.get_items`, `catalogs.get_selections` |
| Cloud Data Ingestion | `cdi.integration_list`, `cdi.integration_job_status` |
| Content Blocks | `content_blocks.list`, `content_blocks.info`, `content_blocks.translations.get` |
| Custom Attributes | `custom_attributes.get` |
| Email | `email.unsubscribe`, `email.hard_bounces` |
| Events | `events.list`, `events.get`, `events.data_series` |
| KPIs | `kpi.dau.data_series`, `kpi.mau.data_series`, `kpi.new_users.data_series`, `kpi.uninstalls.data_series` |
| Messages | `messages.schedule_broadcasts` |
| News Feed | `feed.list`, `feed.details`, `feed.data_series` |
| Preference Center | `preference_center.list`, `preference_center.get`, `preference_center.user.get` |
| Purchases | `purchases.product_list`, `purchases.revenue_series`, `purchases.quantity_series` |
| SDK Authentication | `sdk_authentication.keys` |
| Segments | `segments.list`, `segments.details`, `segments.data_series` |
| Sessions | `sessions.data_series` |
| SMS | `sms.invalid_phone_numbers` |
| Subscription | `subscription.groups.get`, `subscription.status.get` |
| Templates | `templates.email.list`, `templates.email.info`, `templates.translations.get` |
| User Data | `users.export.ids`, `users.export.segment`, `users.export.global_control_group` |

Media Library has no read scope at all — only `media_library.create` and `media_library.replace`.
A read-only key cannot enumerate the media library.

## Scopes that read as safe but are not

`email.unsubscribe` and `sms.invalid_phone_numbers` are phrased as actions but are both `GET`
queries returning a list. They belong on a read-only key. The removal counterparts —
`email.bounce.remove`, `email.spam.remove`, `sms.invalid_phone_numbers.remove` — do not.

`cdi.integration_sync` sits between the two safe Cloud Data Ingestion reads and triggers a real
sync. Do not grant a CDI section wholesale.

`sdk_authentication.keys` returns live SDK signing keys. Reading them is sufficient to forge SDK
authentication, so grant it only to a key that needs to rotate them.

`users.export.*` returns complete user profiles: every custom attribute, email address, phone
number and purchase record. It is a read, but it is the widest PII surface Braze exposes over
REST. Grant it only for a named job — `braze-test-users` is Orbit's only consumer.

## Write scopes Orbit uses

Orbit's publishing features need a second, separately scoped key. Keep it distinct from the
read-only key so analytics work cannot mutate anything.

| Feature | Write permissions |
|---|---|
| Publish or update an email template | `templates.email.create`, `templates.email.update` |
| Publish or update a Content Block | `content_blocks.create`, `content_blocks.update` |
| Upload an image asset | `media_library.create`, `media_library.replace` |

Nothing in Orbit requires `messages.send`, `campaigns.trigger.send`, `canvas.trigger.send`,
`users.track`, `users.delete`, `email.blacklist`, or `subscription.status.set`. If a key carries
those, it is over-scoped for this tool.

## Canvas configuration is not a permission problem

There is no API-key scope that lets REST write canvas structure, names, or step names — the
endpoints do not exist. See `skills/braze-canvas-conformance.md` for the probe evidence. Granting
more Canvas permissions will not unlock it.
