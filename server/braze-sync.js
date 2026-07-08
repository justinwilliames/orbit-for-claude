import {
  BRAZE_SYNC_RECORD_SCHEMA
} from "./production-specs.js";
import { brazePost, brazeUploadAsset, validateBrazeSetup } from "./braze-api.js";
import {
  loadLibraryItem,
  updateLibraryItem
} from "./template-library.js";
import {
  inferMimeType,
  isUploadableImagePath,
  maybeReadTextFile,
  parseJsonInput,
  slugify
} from "./utils.js";
import { basename } from "node:path";
import { assertPublicHttpUrl } from "./url-guard.js";

// Thin adapter that preserves the historical callBrazeApi(...) signature
// used throughout this file, delegating to the shared brazePost client
// (rate-limited, timeout-guarded, standardised error message format).
async function callBrazeApi({ config, endpoint, method = "POST", body }) {
  if (method.toUpperCase() !== "POST") {
    throw new Error(`callBrazeApi only supports POST (got ${method}).`);
  }
  return brazePost({ config, endpoint, body });
}

export async function syncBrazeContentBlocks({
  config,
  componentRefs = [],
  libraryDir,
  state = "draft",
  tags = [],
  dryRun = false
}) {
  const brazeSetup = validateBrazeSetup(config);
  if (brazeSetup) {
    return brazeSetup;
  }

  const normalizedRefs = componentRefs.map((ref) => parseLibraryRef(ref, "email_component")).filter(Boolean);
  if (normalizedRefs.length === 0) {
    return {
      status: "needs_inputs",
      missing: ["component_refs"],
      message: "Provide one or more email component refs to sync."
    };
  }

  const results = [];
  for (const ref of normalizedRefs) {
    const loaded = loadLibraryItem({
      config,
      libraryDir,
      itemType: "email_component",
      slug: ref.slug,
      version: ref.version
    });
    if (loaded.status !== "ok") {
      results.push({
        ref: ref.raw,
        status: "not_found"
      });
      continue;
    }

    const component = loaded.payload.artifact;
    const syncMeta = loaded.item.metadata?.braze_sync?.content_block ?? null;
    const requestBody = {
      ...(syncMeta?.braze_id ? { content_block_id: syncMeta.braze_id } : {}),
      name: buildBrazeContentBlockName(loaded.item),
      description: `Orbit component ${component.display_label}`,
      content: buildBrazeContentBlockHtml(loaded.payload),
      state,
      tags
    };

    if (dryRun) {
      results.push({
        ref: ref.raw,
        status: "dry_run",
        request_body: requestBody
      });
      continue;
    }

    const endpoint = syncMeta?.braze_id ? "/content_blocks/update" : "/content_blocks/create";
    const response = await callBrazeApi({
      config,
      endpoint,
      method: "POST",
      body: requestBody
    });
    const syncRecord = {
      version: "1.0.0",
      type: "braze_sync_record",
      target_type: "content_block",
      status: "ok",
      braze_id: response.content_block_id ?? syncMeta?.braze_id ?? null,
      liquid_tag: response.liquid_tag ?? null,
      synced_at: new Date().toISOString(),
      request_body: requestBody,
      response_body: response
    };
    updateLibraryItem({
      config,
      libraryDir,
      itemType: "email_component",
      slug: ref.slug,
      version: ref.version,
      metadataPatch: {
        braze_sync: {
          ...(loaded.item.metadata?.braze_sync ?? {}),
          content_block: syncRecord
        }
      }
    });
    results.push({
      ref: ref.raw,
      status: "ok",
      sync_record: syncRecord
    });
  }

  return {
    status: results.every((entry) => entry.status === "ok" || entry.status === "dry_run") ? "ok" : "needs_attention",
    schema: BRAZE_SYNC_RECORD_SCHEMA,
    results
  };
}

export async function syncBrazeEmailTemplate({
  config,
  templateRef,
  libraryDir,
  templatePayload,
  templateName,
  description = null,
  dryRun = false
}) {
  const brazeSetup = validateBrazeSetup(config);
  if (brazeSetup) {
    return brazeSetup;
  }

  const loaded =
    templateRef
      ? loadLibraryItemForRef({
          config,
          libraryDir,
          ref: templateRef,
          itemType: "email_template"
        })
      : null;
  const payload =
    templatePayload
      ? (typeof templatePayload === "string"
          ? parseJsonInput(templatePayload, "template payload")
          : templatePayload)
      : loaded?.payload ?? null;
  if (!payload) {
    return {
      status: "needs_inputs",
      missing: ["template_ref or template_payload"],
      message: "Provide a saved email template ref or a template payload."
    };
  }

  const spec = payload.artifact ?? payload.spec ?? null;
  const html =
    maybeReadTextFile(payload.files?.["compiled.html"] ?? payload.files?.compiled_html ?? payload.html) ?? null;
  if (!spec || !html) {
    return {
      status: "needs_inputs",
      missing: ["compiled_html"],
      message: "Orbit needs a compiled HTML email template before syncing to Braze."
    };
  }

  const syncMeta = loaded?.item?.metadata?.braze_sync?.email_template ?? payload.metadata?.braze_sync?.email_template ?? null;
  const requestBody = {
    ...(syncMeta?.braze_id ? { email_template_id: syncMeta.braze_id } : {}),
    template_name: templateName ?? loaded?.item?.title ?? spec.title,
    subject: spec.subject_line,
    preheader: spec.preheader,
    body: html,
    description: description ?? `Orbit email template ${spec.title}`
  };

  if (dryRun) {
    return {
      status: "dry_run",
      request_body: requestBody
    };
  }

  const endpoint = syncMeta?.braze_id ? "/templates/email/update" : "/templates/email/create";
  const response = await callBrazeApi({
    config,
    endpoint,
    method: "POST",
    body: requestBody
  });
  const syncRecord = {
    version: "1.0.0",
    type: "braze_sync_record",
    target_type: "email_template",
    status: "ok",
    braze_id: response.email_template_id ?? syncMeta?.braze_id ?? null,
    template_name: requestBody.template_name,
    synced_at: new Date().toISOString(),
    request_body: requestBody,
    response_body: response
  };

  if (loaded?.item) {
    const parsed = parseLibraryRef(templateRef, "email_template");
    updateLibraryItem({
      config,
      libraryDir,
      itemType: "email_template",
      slug: parsed.slug,
      version: parsed.version,
      metadataPatch: {
        braze_sync: {
          ...(loaded.item.metadata?.braze_sync ?? {}),
          email_template: syncRecord
        }
      }
    });
  }

  return {
    status: "ok",
    schema: BRAZE_SYNC_RECORD_SCHEMA,
    sync_record: syncRecord
  };
}

export async function publishEmailToBraze({
  config,
  componentRefs = [],
  templateRef,
  libraryDir,
  state = "draft",
  tags = [],
  dryRun = false
}) {
  const componentSync = await syncBrazeContentBlocks({
    config,
    componentRefs,
    libraryDir,
    state,
    tags,
    dryRun
  });

  // In a dry run the component step returns status:"dry_run", not "ok", and
  // nothing has been written — proceed to preview the template step too.
  if (!dryRun && componentSync.status !== "ok") {
    return {
      status: "needs_attention",
      component_sync: componentSync,
      message: "Orbit stopped before publishing the final template because component sync did not finish cleanly."
    };
  }

  const templateSync = await syncBrazeEmailTemplate({
    config,
    templateRef,
    libraryDir,
    dryRun
  });

  return {
    status: templateSync.status,
    component_sync: componentSync,
    template_sync: templateSync
  };
}

export async function uploadImagesToBraze({
  config,
  generatedComponents,
  outputDir,
  dryRun = false
}) {
  const brazeSetup = validateBrazeSetup(config);
  if (brazeSetup) {
    return brazeSetup;
  }

  // Collect all images from generated component structures
  const imageManifest = collectImageManifest(generatedComponents);
  if (imageManifest.length === 0) {
    return {
      status: "ok",
      message: "No images to upload — all components are text/layout only.",
      manifest: [],
      uploaded: []
    };
  }

  if (dryRun) {
    return {
      status: "dry_run",
      manifest: imageManifest,
      message: `Found ${imageManifest.length} image(s) to upload to Braze media library.`
    };
  }

  const uploaded = [];
  const errors = [];

  // Local files upload as multipart/form-data binary (brazeUploadAsset), NOT
  // base64 in a JSON body. Cap local files at 4 MB. Remote asset_url has no
  // size handshake so we don't apply the limit there (Braze downloads it
  // server-side).
  const MAX_LOCAL_IMAGE_BYTES = 4 * 1024 * 1024;
  const fs = await import("node:fs");

  for (const image of imageManifest) {
    try {
      // Prefer exported_url (publicly accessible Figma CDN URL) for asset_url approach.
      // Fall back to local file as base64 if no remote URL.
      let response;
      if (image.exported_url) {
        // Remote URL: Braze fetches it server-side via a JSON body.
        response = await callBrazeApi({
          config,
          endpoint: "/media_library/create",
          method: "POST",
          body: { asset_url: image.exported_url, name: image.braze_name }
        });
      } else if (image.local_path) {
        if (!isUploadableImagePath(image.local_path)) {
          errors.push({
            image_id: image.id,
            error: `Refusing to read non-image local file: ${image.local_path}. Only image files (.png/.jpg/.jpeg/.gif/.webp/.svg) can be uploaded.`
          });
          continue;
        }
        if (!fs.existsSync(image.local_path)) {
          errors.push({
            image_id: image.id,
            error: `Local file not found: ${image.local_path}`
          });
          continue;
        }
        const stat = fs.statSync(image.local_path);
        if (stat.size > MAX_LOCAL_IMAGE_BYTES) {
          errors.push({
            image_id: image.id,
            error: `Local file too large: ${Math.round(stat.size / 1024)}KB exceeds Braze upload cap of ${MAX_LOCAL_IMAGE_BYTES / 1024}KB. Compress or convert to JPEG, or host the image on a CDN and pass it via exported_url.`
          });
          continue;
        }
        // Local file: Braze requires a multipart/form-data binary upload.
        const fileData = fs.readFileSync(image.local_path);
        const { file_name, content_type } = deriveUploadFileFields({
          name: image.braze_name,
          filePath: image.local_path
        });
        response = await brazeUploadAsset({
          config,
          fileBuffer: fileData,
          fileName: file_name,
          contentType: content_type,
          name: image.braze_name
        });
      } else {
        errors.push({
          image_id: image.id,
          error: "No exported_url or local_path available for upload"
        });
        continue;
      }

      const asset = response.new_assets?.[0] ?? null;
      if (asset?.url) {
        uploaded.push({
          image_id: image.id,
          source_node_id: image.source_node_id,
          component_name: image.component_name,
          original_src: image.current_src,
          braze_cdn_url: asset.url,
          braze_name: asset.name ?? image.braze_name,
          size: asset.size ?? null
        });
      } else {
        errors.push({
          image_id: image.id,
          error: "Braze returned no asset URL",
          response
        });
      }
    } catch (err) {
      errors.push({
        image_id: image.id,
        error: err.message
      });
    }
  }

  return {
    status: errors.length === 0 ? "ok" : uploaded.length > 0 ? "partial" : "failed",
    manifest: imageManifest,
    uploaded,
    errors: errors.length > 0 ? errors : undefined,
    message: `Uploaded ${uploaded.length}/${imageManifest.length} image(s) to Braze media library.`
  };
}

// ---------------------------------------------------------------------------
// Single-image upload helper
// ---------------------------------------------------------------------------

// Derive the filename and MIME type for a multipart media upload. Braze's
// /media_library/create takes the binary as a multipart/form-data part whose
// filename and Content-Type are carried by the part itself, so we need both.
// Use the source path's basename when we have one, otherwise synthesise a
// filename from the display name and inferred extension.
function deriveUploadFileFields({ name, filePath }) {
  const source = filePath || name || "image.png";
  let contentType = inferMimeType(source);
  if (!contentType.startsWith("image/")) contentType = "image/png";

  let fileName;
  if (filePath) {
    fileName = basename(filePath);
  } else {
    const ext = contentType === "image/jpeg"
      ? "jpg"
      : contentType.replace("image/", "").replace("svg+xml", "svg");
    fileName = /\.[a-z0-9]+$/i.test(name || "") ? name : `${name || "image"}.${ext}`;
  }

  return { file_name: fileName, content_type: contentType };
}

/**
 * Upload a single image to the Braze media library.
 *
 * Accepts one of:
 *   asset_url       — publicly accessible remote URL; Braze fetches it
 *                     server-side via a JSON body (no size limit here).
 *   file_path       — absolute local path; read and uploaded as
 *                     multipart/form-data binary. Capped at 4 MB.
 *   image_data_base64 — raw base64 string; decoded to a binary buffer and
 *                       uploaded as multipart/form-data.
 *
 * Returns { status, url, name, size } on success or { status, error } on failure.
 */
export async function uploadSingleImageToBraze({ config, asset_url, file_path, image_data_base64, name }) {
  const brazeSetup = validateBrazeSetup(config);
  if (brazeSetup) return brazeSetup;

  if (!name || typeof name !== "string") {
    return { status: "invalid_input", error: "`name` is required and must be a non-empty string." };
  }

  const MAX_LOCAL_IMAGE_BYTES = 4 * 1024 * 1024;

  // Resolve into either a JSON remote-fetch (asset_url) or a multipart binary
  // upload (file_path / image_data_base64). Braze's /media_library/create
  // rejects base64 in a JSON body; binary files must go as multipart/form-data.
  let uploadKind;
  let jsonBody;
  let fileBuffer;
  let fileName;
  let contentType;

  if (asset_url) {
    // Braze fetches asset_url server-side, so an unvalidated URL is an
    // SSRF vector. Require https + a public host before forwarding.
    try {
      const parsedAsset = await assertPublicHttpUrl(asset_url);
      if (parsedAsset.protocol !== "https:") {
        return { status: "invalid_input", error: "`asset_url` must be an https URL." };
      }
    } catch (err) {
      return { status: "invalid_input", error: `Rejected asset_url: ${err.message}` };
    }
    uploadKind = "url";
    jsonBody = { asset_url, name };
  } else if (file_path) {
    const fs = await import("node:fs");
    if (!isUploadableImagePath(file_path)) {
      return {
        status: "invalid_input",
        error: "`file_path` must point to an image file (.png/.jpg/.jpeg/.gif/.webp/.svg). Refusing to read a non-image local file.",
      };
    }
    if (!fs.existsSync(file_path)) {
      return { status: "file_not_found", error: `File not found: ${file_path}` };
    }
    const stat = fs.statSync(file_path);
    if (stat.size > MAX_LOCAL_IMAGE_BYTES) {
      return {
        status: "file_too_large",
        error: `File is ${Math.round(stat.size / 1024)} KB; Braze upload cap is ${MAX_LOCAL_IMAGE_BYTES / 1024} KB. Compress or host the image on a CDN and pass it via asset_url.`,
      };
    }
    uploadKind = "binary";
    fileBuffer = fs.readFileSync(file_path);
    ({ file_name: fileName, content_type: contentType } = deriveUploadFileFields({ name, filePath: file_path }));
  } else if (image_data_base64) {
    uploadKind = "binary";
    fileBuffer = Buffer.from(image_data_base64, "base64");
    ({ file_name: fileName, content_type: contentType } = deriveUploadFileFields({ name }));
  } else {
    return {
      status: "invalid_input",
      error: "Provide one of: asset_url, file_path, or image_data_base64.",
    };
  }

  try {
    const response = uploadKind === "url"
      ? await callBrazeApi({ config, endpoint: "/media_library/create", method: "POST", body: jsonBody })
      : await brazeUploadAsset({ config, fileBuffer, fileName, contentType, name });
    const asset = response.new_assets?.[0] ?? null;
    if (asset?.url) {
      return {
        status: "ok",
        url: asset.url,
        name: asset.name ?? name,
        size: asset.size ?? null,
        host: "braze",
      };
    }
    return { status: "failed", error: "Braze returned no asset URL.", raw_response: response };
  } catch (err) {
    return { status: "failed", error: err.message };
  }
}

/**
 * Upload a flat file-list batch to the Braze media library in ONE call.
 *
 * This is the plain-batch counterpart to uploadImagesToBraze (which only
 * consumes generated-component STRUCTURES). It lets an operator upload a
 * large set of loose assets — e.g. every hosted image in a multi-module
 * program — without wrapping them in a component tree.
 *
 * `images` is an array of per-item descriptors, each carrying a `name`
 * plus ONE source:
 *   { name, file_path }  — absolute local image path (multipart binary, 4 MB cap)
 *   { name, url }        — publicly accessible remote URL (Braze fetches it)
 *   { name, image_data_base64 } — raw base64 (multipart binary)
 *
 * Each item is normalised and pushed through uploadSingleImageToBraze, so
 * it inherits the isUploadableImagePath guard, the SSRF host check, and the
 * new_assets[0].url parse verbatim — the CDN url is at new_assets[0].url,
 * NOT a top-level field. Results preserve the operator-supplied `name` as
 * the per-item key (the Braze-echoed asset name can differ), returning
 * { name, braze_cdn_url } per uploaded item.
 */
export async function uploadImageBatchToBraze({ config, images, dryRun = false }) {
  const brazeSetup = validateBrazeSetup(config);
  if (brazeSetup) return brazeSetup;

  if (!Array.isArray(images) || images.length === 0) {
    return {
      status: "needs_inputs",
      message: "Provide `images_json`: a non-empty JSON array of { name, file_path } and/or { name, url } objects.",
    };
  }

  // Normalise each descriptor up-front so a malformed item is reported
  // rather than silently skipped. `url` is the operator-facing alias for
  // the single-upload helper's `asset_url`.
  const normalised = [];
  const errors = [];
  images.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      errors.push({ index, error: "Each item must be an object with a `name` and a source (file_path / url)." });
      return;
    }
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) {
      errors.push({ index, error: "Missing `name` (used as the Braze media-library filename and the per-item result key)." });
      return;
    }
    const asset_url = item.url ?? item.asset_url;
    const { file_path, image_data_base64 } = item;
    if (!asset_url && !file_path && !image_data_base64) {
      errors.push({ name, index, error: "Provide one source per item: `file_path`, `url`, or `image_data_base64`." });
      return;
    }
    normalised.push({ name, asset_url, file_path, image_data_base64 });
  });

  if (dryRun) {
    return {
      status: errors.length === 0 ? "dry_run" : "needs_inputs",
      count: normalised.length,
      manifest: normalised.map(({ name, asset_url, file_path }) => ({
        name,
        source: asset_url ? "url" : file_path ? "file_path" : "image_data_base64",
      })),
      errors: errors.length > 0 ? errors : undefined,
      message: `Found ${normalised.length} image(s) to upload to Braze media library.`,
    };
  }

  const uploaded = [];
  for (const item of normalised) {
    // eslint-disable-next-line no-await-in-loop -- Braze media_library has no batch endpoint; sequential keeps us under the rate limiter.
    const result = await uploadSingleImageToBraze({
      config,
      name: item.name,
      asset_url: item.asset_url,
      file_path: item.file_path,
      image_data_base64: item.image_data_base64,
    });
    if (result.status === "ok" && result.url) {
      uploaded.push({ name: item.name, braze_cdn_url: result.url, size: result.size ?? null });
    } else {
      errors.push({ name: item.name, error: result.error ?? `Upload failed (${result.status}).` });
    }
  }

  return {
    status: errors.length === 0 ? "ok" : uploaded.length > 0 ? "partial" : "failed",
    requested: images.length,
    uploaded_count: uploaded.length,
    uploaded,
    errors: errors.length > 0 ? errors : undefined,
    message: `Uploaded ${uploaded.length}/${images.length} image(s) to Braze media library.`,
  };
}

// ---------------------------------------------------------------------------

function collectImageManifest(generatedComponents) {
  const images = [];
  let counter = 0;

  for (const entry of generatedComponents ?? []) {
    const component = entry.component ?? entry;
    const structure = component.structure;
    if (!structure) continue;

    walkStructureForImages(structure, (imageNode) => {
      counter++;
      const id = `img-${counter}`;
      const safeName = slugify(
        `${component.inferred_name}-${imageNode.name ?? "image"}-${counter}`
      );
      images.push({
        id,
        source_node_id: imageNode.source_node_id ?? null,
        component_id: component.id,
        component_name: component.display_label ?? component.inferred_name,
        name: imageNode.name ?? `Image ${counter}`,
        braze_name: safeName,
        width: imageNode.width ?? null,
        height: imageNode.height ?? null,
        exported_url: imageNode.exported_url ?? null,
        local_path: imageNode.local_path ?? null,
        current_src: imageNode.exported_url ?? `https://placehold.co/${imageNode.width ?? 600}x${imageNode.height ?? 400}/png`
      });
    });
  }

  return images;
}

function walkStructureForImages(node, visitor) {
  if (!node) return;
  if (node.type === "image") {
    visitor(node);
  }
  for (const child of node.children ?? []) {
    walkStructureForImages(child, visitor);
  }
}

function buildBrazeContentBlockName(item) {
  return slugify(`${item.slug}-${item.version}`).replace(/-/g, "_");
}

function buildBrazeContentBlockHtml(payload) {
  const compiledHtml = maybeReadTextFile(payload.files?.["compiled.html"] ?? payload.files?.compiled_html);
  if (compiledHtml) {
    return String(compiledHtml);
  }

  const artifact = payload.artifact ?? {};
  return String(
    artifact.default_content?.html ??
      artifact.default_content?.legal_copy ??
      artifact.default_content?.message ??
      artifact.default_content?.support_line ??
      `<!-- Orbit component ${artifact.display_label ?? "component"} -->`
  );
}

function loadLibraryItemForRef({ config, libraryDir, ref, itemType }) {
  const parsed = parseLibraryRef(ref, itemType);
  if (!parsed) {
    return null;
  }

  const loaded = loadLibraryItem({
    config,
    libraryDir,
    itemType,
    slug: parsed.slug,
    version: parsed.version
  });
  if (loaded.status !== "ok") {
    return null;
  }

  return loaded;
}

function parseLibraryRef(ref, expectedType) {
  const raw = String(ref ?? "").trim();
  const parts = raw.split(":").filter(Boolean);
  if (parts.length < 3) {
    return null;
  }
  if (parts[0] !== expectedType) {
    return null;
  }
  return {
    raw,
    slug: slugify(parts[1]),
    version: slugify(parts[2])
  };
}

