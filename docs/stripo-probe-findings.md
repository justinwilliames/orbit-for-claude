# Stripo API probe findings

Generated: 2026-05-07T00:01:34.110Z

## Credential presence

- `ORBIT_STRIPO_PLUGIN_ID`: set
- `ORBIT_STRIPO_SECRET_KEY`: set
- `ORBIT_STRIPO_REST_API_TOKEN`: set
- `ORBIT_STRIPO_MASTER_TEMPLATE_ID`: missing (generateemail probe will be skipped)
- `ORBIT_STRIPO_FOLDER_ID`: missing (will use account default)

## Probe results

### Plugin auth (role=USER)

**Status:** pass

```
JWT minted: eyJhbG…qm7Q (243 chars)
Response shape keys: token
```

### Plugin auth (role=API)

**Status:** pass

```
JWT minted: eyJhbG…uvHw (242 chars)
Response shape keys: token
```

### findmodules via plugin-API-JWT (role=API)

**Status:** fail

```
HTTP 401 — {"timestamp":"2026-05-07T00:01:31.583Z","status":401,"error":"Unauthorized","path":"/v1/modules"}
```

### findmodules via plugin-API-JWT + includeContent=true

**Status:** fail

```
HTTP 401 — {"timestamp":"2026-05-07T00:01:32.785Z","status":401,"error":"Unauthorized","path":"/v1/modules"}
```

### findmodules via plugin-API-JWT + withContent=true

**Status:** fail

```
HTTP 401 — {"timestamp":"2026-05-07T00:01:33.070Z","status":401,"error":"Unauthorized","path":"/v1/modules"}
```

### findmodules via REST token (Stripo-Api-Auth header)

**Status:** pass

```
Total reported by API: 15
Items returned in this page: 5
Top-level response keys: data, total
Sample module keys: blockType, category, croppedIcon, css, description, height, icon, id, markup, name, scope, synchronizable, tagObjects, uid, width
HTML included on first call: no
Sample (first 1500 chars):
{
  "blockType": "STRIPE",
  "category": [
    {
      "key": "header"
    }
  ],
  "croppedIcon": null,
  "css": "/* CONFIG STYLES Please do not delete and edit CSS styles below */\n/* IMPORTANT THIS STYLES MUST BE ON FINAL EMAIL */\n.rollover:hover .rollover-first {\n  max-height: 0px !important;\n  display: none !important;\n}\n.rollover:hover .rollover-second {\n  max-height: none !important;\n  display: block !important;\n}\n.rollover span {\n  font-size: 0px;\n}\nu + .body img ~ div div {\n  display: none;\n}\n#outlook a {\n  padding: 0;\n}\nspan.MsoHyperlink,\nspan.MsoHyperlinkFollowed {\n  color: inherit;\n  mso-style-priority: 99;\n}\na.es-button {\n  mso-style-priority: 100 !important;\n  text-decoration: none !important;\n}\na[x-apple-data-detectors],\n#MessageViewBody a {\n  color: inherit !important;\n  text-decoration: none !important;\n  font-size: inherit !important;\n  font-family: inherit !important;\n  font-weight: inherit !important;\n  line-height: inherit !important;\n}\n.es-desk-hidden {\n  display: none;\n  float: left;\n  overflow: hidden;\n  width: 0;\n  max-height: 0;\n  line-height: 0;\n  mso-hide: all;\n}\n/*\n  END OF IMPORTANT\n*/\nbody {\n  width: 100%;\n  height: 100%;\n  font-family: Inter,sans-serif;\n  -webkit-text-size-adjust: 100%;\n  -ms-text-size-adjust: 100%;\n}\ntable {\n  mso-table-lspace: 0pt;\n  mso-table-rspace: 0pt;\n  border-spacing: 0px;\n}\ntable td,\nbody,\n.es-wrapper {\n  padding: 0;\n  Margin: 0;\n}\n.es-content,\n.es-head
```

### generateemail

**Status:** skip

```
ORBIT_STRIPO_MASTER_TEMPLATE_ID not provided.
```

## Decisions to make

1. **Do we need both Plugin auth (role=API) JWT _and_ a separate REST token?**
   - If `findmodules via plugin-API-JWT` passes, we can ship with just plugin creds in user_config.
   - If only `findmodules via REST token` passes, the REST token is mandatory for module sync.

2. **Does `findmodules` return HTML in the default call?**
   - If no, the sync tool needs a per-module follow-up call OR a query param to opt in.

3. **Does `generateemail` return an editor URL?**
   - If yes, we wire it into the compose tool's `editor_hint` field.
   - If no, the hint falls back to "open Stripo and look in folder X for `[Orbit probe — safe to delete]…`".

4. **Any unexpected response fields worth capturing in the schema?** Look at the sample-keys lines above.
