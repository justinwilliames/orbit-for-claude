import { GoogleGenAI } from "@google/genai";

const GEMINI_TIMEOUT_MS = 90_000;
const GEMINI_MAX_ATTEMPTS = 2;

// Preferred image-capable models in priority order (best first).
// resolveImageModel() queries the API for the live model list and picks the
// highest-priority match.  If the API call fails we fall back to the first
// entry that the caller's config names, then to the hardcoded default.
const IMAGE_MODEL_PRIORITY = [
  "gemini-2.5-flash-preview-image-generation",
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-exp"
];
const HARDCODED_FALLBACK_MODEL = "gemini-2.5-flash-preview-image-generation";

// Cache so we only hit the models endpoint once per process lifetime.
let _resolvedModel = null;

/**
 * Query the Gemini API for available models and pick the best
 * image-generation-capable one.  Returns the model ID string.
 */
export async function resolveImageModel(apiKey) {
  if (_resolvedModel) return _resolvedModel;
  if (!apiKey) return HARDCODED_FALLBACK_MODEL;

  try {
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.list();
    const models = response?.models ?? response ?? [];
    const available = new Set();
    for (const model of models) {
      const id = model.name?.replace(/^models\//, "") ?? model.id ?? "";
      if (id) available.add(id);
    }

    for (const preferred of IMAGE_MODEL_PRIORITY) {
      if (available.has(preferred)) {
        _resolvedModel = preferred;
        return _resolvedModel;
      }
    }

    // No priority match — look for any model whose name contains "image"
    for (const model of models) {
      const id = model.name?.replace(/^models\//, "") ?? model.id ?? "";
      if (/image/i.test(id) && !/deprecated/i.test(model.description ?? "")) {
        _resolvedModel = id;
        return _resolvedModel;
      }
    }
  } catch {
    // API unreachable at startup — fall through to hardcoded default
  }

  _resolvedModel = HARDCODED_FALLBACK_MODEL;
  return _resolvedModel;
}

/** Clear the cached model (useful for tests). */
export function resetModelCache() {
  _resolvedModel = null;
}

export async function generateBrandArtLayer({
  config,
  prompt,
  referenceImages = [],
  canvas,
  variationIndex = 0
}) {
  // Test-only: generate a placeholder art layer without calling Gemini.
  // Activated by ORBIT_TEST_MOCK_IMAGES=1 (set in the smoke test runner).
  if (process.env.ORBIT_TEST_MOCK_IMAGES === "1") {
    return generateTestArtLayer({ canvas, variationIndex });
  }

  if (!config.googleAiApiKey) {
    const error = new Error(
      "Gemini API key is not configured. Set ORBIT_GOOGLE_AI_API_KEY in your environment and restart Claude Code."
    );
    error.code = "CONFIGURATION_ERROR";
    throw error;
  }

  const model = await resolveImageModel(config.googleAiApiKey);
  const client = new GoogleGenAI({ apiKey: config.googleAiApiKey });
  const parts = [
    { text: `${prompt}\n\nVariation index: ${variationIndex + 1}` },
    ...referenceImages.map((image) => ({
      inlineData: {
        mimeType: image.mimeType,
        data: image.base64
      }
    }))
  ];

  const requestConfig = {
    model,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: canvas.providerAspectRatio ?? canvas.aspectRatio
      }
    }
  };

  let lastError;
  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await callWithTimeout(
        () => client.models.generateContent(requestConfig),
        GEMINI_TIMEOUT_MS
      );

      const firstImagePart = response.candidates?.[0]?.content?.parts?.find(
        (part) => part.inlineData?.data
      );
      if (!firstImagePart?.inlineData?.data) {
        const error = new Error(
          `Gemini (${model}) did not return an image. ${response.text ?? "No text response."}`
        );
        error.code = "PROVIDER_ERROR";
        throw error;
      }

      return {
        provider: "gemini",
        model,
        mimeType: firstImagePart.inlineData.mimeType ?? "image/png",
        buffer: Buffer.from(firstImagePart.inlineData.data, "base64"),
        base64: firstImagePart.inlineData.data,
        text: response.text ?? ""
      };
    } catch (err) {
      lastError = err;
      if (err.code === "GEMINI_TIMEOUT" && attempt < GEMINI_MAX_ATTEMPTS) {
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

async function callWithTimeout(fn, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(
        `Gemini image generation timed out after ${timeoutMs / 1000}s. ` +
        "The model may be under heavy load — retry or try again shortly."
      );
      err.code = "GEMINI_TIMEOUT";
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function generateTestArtLayer({ canvas, variationIndex }) {
  const palette = [
    ["#f7d5c8", "#f0efe7", "#d6e7f7"],
    ["#d8ebdf", "#efe3d1", "#f7d2cb"],
    ["#dfe7f8", "#efe5d6", "#f7e8c6"]
  ][variationIndex % 3];
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">`,
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0%" stop-color="${palette[0]}"/>`,
    `<stop offset="100%" stop-color="${palette[2]}"/>`,
    `</linearGradient></defs>`,
    `<rect width="${canvas.width}" height="${canvas.height}" fill="url(#bg)"/>`,
    `</svg>`
  ].join("");

  return {
    provider: "test-mock",
    model: "test-mock",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(svg),
    base64: Buffer.from(svg).toString("base64"),
    text: "Test mock art layer"
  };
}
