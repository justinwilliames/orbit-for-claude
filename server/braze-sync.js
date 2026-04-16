import {
  BRAZE_SYNC_RECORD_SCHEMA
} from "./production-specs.js";
import { validateBrazeEndpoint } from "./config.js";
import {
  loadLibraryItem,
  updateLibraryItem
} from "./template-library.js";
import {
  maybeReadTextFile,
  parseJsonInput,
  safeParseJson,
  slugify
} from "./utils.js";

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
  tags = []
}) {
  const componentSync = await syncBrazeContentBlocks({
    config,
    componentRefs,
    libraryDir,
    state,
    tags
  });

  if (componentSync.status !== "ok") {
    return {
      status: "needs_attention",
      component_sync: componentSync,
      message: "Orbit stopped before publishing the final template because component sync did not finish cleanly."
    };
  }

  const templateSync = await syncBrazeEmailTemplate({
    config,
    templateRef,
    libraryDir
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

  for (const image of imageManifest) {
    try {
      // Prefer exported_url (publicly accessible Figma CDN URL) for asset_url approach.
      // Fall back to local file as base64 if no remote URL.
      let requestBody;
      if (image.exported_url) {
        requestBody = {
          asset_url: image.exported_url,
          name: image.braze_name
        };
      } else if (image.local_path) {
        const fs = await import("node:fs");
        if (fs.existsSync(image.local_path)) {
          const fileData = fs.readFileSync(image.local_path);
          requestBody = {
            asset_file: fileData.toString("base64"),
            name: image.braze_name
          };
        } else {
          errors.push({
            image_id: image.id,
            error: `Local file not found: ${image.local_path}`
          });
          continue;
        }
      } else {
        errors.push({
          image_id: image.id,
          error: "No exported_url or local_path available for upload"
        });
        continue;
      }

      const response = await callBrazeApi({
        config,
        endpoint: "/media_library/create",
        method: "POST",
        body: requestBody
      });

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

function validateBrazeSetup(config) {
  if (!config.brazeApiKey || !config.brazeRestEndpoint) {
    return {
      status: "needs_setup",
      missing: [
        ...(!config.brazeApiKey ? ["braze_api_key"] : []),
        ...(!config.brazeRestEndpoint ? ["braze_rest_endpoint"] : [])
      ],
      message: "Set Braze API credentials before publishing to Braze."
    };
  }

  const endpointError = validateBrazeEndpoint(config.brazeRestEndpoint);
  if (endpointError) {
    return {
      status: "needs_setup",
      missing: ["braze_rest_endpoint"],
      message: endpointError
    };
  }

  return null;
}

const BRAZE_API_TIMEOUT_MS = 15_000;

async function callBrazeApi({ config, endpoint, method, body }) {
  const url = `${config.brazeRestEndpoint.replace(/\/+$/g, "")}${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BRAZE_API_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.brazeApiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
  const text = await response.text();
  const parsed = safeParseJson(text, { message: text });
  if (!response.ok) {
    const brazeMsg = parsed?.message ?? parsed?.errors?.[0] ?? text;
    throw new Error(`Braze API ${response.status} on ${endpoint}: ${brazeMsg}`);
  }
  return parsed;
}
