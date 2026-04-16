---
name: braze-master-template
description: >
  Use this skill when the user wants to import an existing HTML email template, break it
  into reusable modules, generate multiple content variations from it, or manage template
  images. Trigger on "use my existing template", "import this HTML email", "generate 10
  email variations", "break this template into sections", "upload these images to Braze",
  "I have a master template", or any request involving template reuse, variation generation,
  or image management for email production.
---

# Master Template Workflow

Import an existing HTML email template (from Braze or file upload), parse it into reusable sections/modules, generate N content variations, and manage image assets through Braze's media library.

**This is for teams that already have a working email template and want Orbit to produce variations from it — not build from scratch.**

---

## Workflow Steps

### Step 1: Get the master template

**Option A — Fetch from Braze:**
```
orbit_list_braze_templates → find the template
orbit_fetch_braze_template → get the full HTML
```

**Option B — Upload directly:**
Provide the HTML content or a file path to `orbit_parse_master_template`.

### Step 2: Parse into modules

```
orbit_parse_master_template
  html_content: "<html>..."
  template_name: "onboarding-master"
```

Returns:
- Sections (header, hero, body, CTA, footer, etc.)
- Content slots (headings, paragraphs, CTAs) with current text
- Image slots with current URLs and dimensions
- Liquid variables found in the template

### Step 3: Generate variation specs

```
orbit_generate_template_variations
  parsed_template_json: <from step 2>
  variation_count: 10
  variation_briefs_json: [{ name: "Welcome", subject: "Welcome aboard!" }, ...]
```

Returns N variation specs, each with empty content slots and image slots to fill.

### Step 4: Populate content

For each variation, fill in:
- `content_slots[].replacement` — the copy for that email
- `image_slots[].replacement_url` — Braze CDN URLs for images

### Step 5: Handle images

**Option A — Provide Braze CDN URLs directly:**
If images are already in Braze's media library, paste the URLs into the image slots.

**Option B — Upload to Braze:**
```
orbit_upload_template_images
  images_json: [{ name: "hero-image", url: "https://..." }, { name: "logo", file_path: "/path/to/logo.png" }]
```

Returns Braze CDN URLs for each uploaded image.

**Option C — Upload via Claude:**
Upload images to the Claude conversation, then use `orbit_upload_template_images` with the local file path.

### Step 6: Assemble final HTML

```
orbit_assemble_template_variation
  parsed_template_json: <from step 2>
  variation_spec_json: <populated variation from step 4>
```

Returns the final HTML with all content and images populated.

### Step 7: Publish to Braze

```
orbit_sync_braze_email_template
  template_payload: <assembled HTML>
```

---

## Tools in This Workflow

| Tool | Purpose |
|---|---|
| `orbit_list_braze_templates` | Browse available templates in Braze |
| `orbit_fetch_braze_template` | Fetch full HTML by ID or name |
| `orbit_parse_master_template` | Parse HTML into sections and slots |
| `orbit_generate_template_variations` | Generate N variation specs |
| `orbit_assemble_template_variation` | Build final HTML from a variation spec |
| `orbit_upload_template_images` | Upload images to Braze media library |
| `orbit_check_template_collision` | Check if a template name exists before creating |

## Section Detection

The parser identifies sections using:
1. **HTML comments:** `<!-- MODULE: header -->`, `<!-- SECTION: hero -->`, etc.
2. **Structural patterns:** table rows with class/role markers
3. **Content detection:** headers, images, CTAs, footers, social blocks

For best results, add HTML comments to your master template marking each module boundary.

## Image Handling

Images in the master template are identified by `<img>` tags. Tracking pixels (1x1 images) are automatically excluded. For each image, the parser extracts:
- Current `src` URL
- `alt` text
- `width` and `height` attributes
- Whether it's a placeholder image

When generating variations, Orbit prompts for replacement URLs for each image slot.
