import { GoogleGenAI } from "@google/genai";
import {
  ENFORCED_STYLE_CONSTRAINTS,
  GEMINI_MODEL,
  EXAMPLE_IMAGE_PATHS,
} from "../config";
import { loadImageAsBase64 } from "../assetResolver";

export interface GeminiGenerationOptions {
  prompt: string; // user concept (not the fully composed Gemini prompt)
}

/**
 * Low-level helper: given a fully composed prompt string and a list of reference
 * image paths on disk, call Gemini image model and return the first base64 PNG
 * payload found in the response.
 */
interface GeminiImageFromPromptOptions {
  fullPrompt: string;
  /** Local filesystem image paths (e.g. example reference assets) */
  localImagePaths?: string[];
  /** Remote image URLs that should be fetched and supplied as refs */
  remoteImageUrls?: string[];
  /** Already available base64 PNG (or other) image payloads (no data URI prefix) */
  inlineBase64Images?: { data: string; mimeType?: string }[];
}

/**
 * Unified low-level Gemini image generation helper.
 * Accepts a composed prompt plus any combination of:
 *  - local image paths (loaded & converted to base64)
 *  - remote image URLs (fetched)
 *  - already-inline base64 images
 * Returns the first base64 image found in the Gemini response.
 */
export const generateGeminiImageFromPrompt = async (
  options: GeminiImageFromPromptOptions
): Promise<string> => {
  const {
    fullPrompt,
    localImagePaths = [],
    remoteImageUrls = [],
    inlineBase64Images = [],
  } = options;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY env var");
  const gemini = new GoogleGenAI({ apiKey });

  // Load local reference images
  const localRefs = localImagePaths.map(loadImageAsBase64).map((ref) => ({
    inlineData: { mimeType: ref.mimeType, data: ref.base64 },
  }));

  // Fetch remote references (best-effort sequential; could be parallelized later)
  const remoteRefs: any[] = [];
  for (const url of remoteImageUrls) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const mimeType = resp.headers.get("content-type") || "image/png";
      const arrayBuffer = await resp.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      remoteRefs.push({ inlineData: { mimeType, data: base64 } });
    } catch (err) {
      console.warn(`Skipping remote reference fetch failure for ${url}:`, err);
    }
  }

  const inlineRefs = inlineBase64Images.map((img) => ({
    inlineData: { mimeType: img.mimeType || "image/png", data: img.data },
  }));

  const content = [
    { text: fullPrompt },
    ...localRefs,
    ...remoteRefs,
    ...inlineRefs,
  ];

  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: content as any,
  });

  let base64: string | undefined;
  if (response?.candidates) {
    for (const c of response.candidates) {
      const parts: any[] = (c as any).content?.parts || [];
      for (const p of parts) {
        if (p.inlineData?.data) {
          base64 = p.inlineData.data;
          break;
        }
      }
      if (base64) break;
    }
  }
  if (!base64) throw new Error("Gemini response lacked image data");
  return base64;
};

/**
 * Public API kept stable: accepts a user concept prompt, composes the enforced
 * style + instruction text, then delegates to the lower-level helper with the
 * example image paths.
 */
export const generateImageWithGemini = async ({
  prompt,
}: GeminiGenerationOptions): Promise<string> => {
  const fullPrompt = `Generate a spaceship consistent with the visual style cues of ALL provided reference images (they are variations of the same art style). User concept: ${prompt}. ${ENFORCED_STYLE_CONSTRAINTS}`;
  return generateGeminiImageFromPrompt({
    fullPrompt,
    localImagePaths: EXAMPLE_IMAGE_PATHS,
  });
};

/**
 * Generate an "idle" (thrusters off) variant using an already-generated image URL
 * as the sole reference image. This fetches the remote image (PNG assumed),
 * embeds it, and prompts Gemini to only disable thrusters while keeping
 * everything else identical (layout, palette, proportions, style, background, etc.).
 */
export const generateIdleThrustersOffVariant = async (
  imageUrl: string
): Promise<string> => {
  const fullPrompt = `Using the provided image, remove only the thruster flame. Keep everything else including the thruster on in the muzzle flash, preserving the original style, lighting, and composition.`;
  return generateGeminiImageFromPrompt({
    fullPrompt,
    remoteImageUrls: [imageUrl],
  });
};
