import { GoogleGenAI } from "@google/genai";
import {
  ENFORCED_STYLE_CONSTRAINTS,
  GEMINI_MODEL,
  EXAMPLE_IMAGE_PATHS,
  ENFORCED_STYLE_CONSTRAINTS_V2,
} from "../config";
import { loadImageAsBase64 } from "../assetResolver";

export interface GeminiGenerationOptions {
  prompt: string; // user concept (not the fully composed Gemini prompt)
}

/**
 * Generate a playful, light-hearted spaceship name from a short concept prompt.
 * Returns a single line string with no quotes.
 */
export const generateShipName = async (prompt: string): Promise<string> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY env var");
  const gemini = new GoogleGenAI({ apiKey });

  const instructions = [
    "You are a whimsical spaceship namer.",
    "Given a short concept for a ship, return exactly one playful, light-hearted.",
    "Constraints:",
    "- 2–5 words.",
    "- No existing IP names or trademarked references.",
    "- No profanity or offensive content.",
    "- Avoid serial numbers unless part of a clear joke.",
    "Output: Return only the name with no quotes or extra text.",
  ].join("\n");

  const contents: any = [
    {
      role: "user",
      parts: [
        {
          text: `${instructions}\n\nConcept: ${prompt}\n\nName:`,
        },
      ],
    },
  ];

  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents,
  });

  // Prefer concatenating any text parts in the first candidate
  let text = "";
  const candidates: any[] = (response as any)?.candidates || [];
  for (const c of candidates) {
    const parts: any[] = (c as any)?.content?.parts || [];
    for (const p of parts) {
      if (typeof p.text === "string") text += p.text;
    }
    if (text) break;
  }

  const name =
    (text || "")
      .split("\n")
      .map((s) => s.trim())
      .find((s) => s.length > 0) || "";

  const cleaned = name
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) throw new Error("No name generated");
  return cleaned;
};

/**
 * Expand a short user prompt into a detailed, vivid spaceship description.
 * This adds creative but consistent details to reduce vagueness, while
 * explicitly avoiding disallowed content or copyright/trademark references.
 */
export const expandShipPrompt = async (prompt: string): Promise<string> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY env var");
  const gemini = new GoogleGenAI({ apiKey });

  const system = [
    "You are a helpful prompt expander for a top-down 2D arcade spaceship generator.",
    "Goal: Enrich a short user idea into a single concise paragraph (120-220 words) that is imaginative, concrete, and game-ready.",
    "Keep it compatible with strict rendering rules that will be appended later (orientation, guns, thrusters).",
    "Guidelines:",
    "- Invent tasteful details: hull silhouette, materials, color accents, decals/symbols, faction vibe, wear/age, role/class (interceptor, hauler, medic, scavenger, etc.).",
    "- Suggest functional features consistent with a top-down sprite (intakes, radiators, fins, plating seams).",
    "- Avoid calling for perspective/angled views, pilots, cockpits from side, or environments.",
    "- No real-world IP names, franchise terms, or logos. Use generic descriptors.",
    "- Avoid profanity or sensitive content.",
    "Output: Return only the expanded description paragraph with no headings or bullets.",
  ].join("\n");

  const contents: any = [
    {
      role: "user",
      parts: [{ text: `${system}\n\nUser idea: ${prompt}\n\nExpanded:` }],
    },
  ];

  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents,
  });

  let text = "";
  const candidates: any[] = (response as any)?.candidates || [];
  for (const c of candidates) {
    const parts: any[] = (c as any)?.content?.parts || [];
    for (const p of parts) if (typeof p.text === "string") text += p.text;
    if (text) break;
  }

  const expanded = (text || "").replace(/\s+/g, " ").trim();
  if (!expanded) throw new Error("No expanded prompt produced");
  console.log("Expanded prompt:", expanded);
  return expanded;
};

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
  const fullPrompt = `Generate a spaceship based on the user prompt: "${prompt}". ${ENFORCED_STYLE_CONSTRAINTS}`;
  return generateGeminiImageFromPrompt({
    fullPrompt,
    localImagePaths: EXAMPLE_IMAGE_PATHS,
  });
};

/**
 * Internal helper to derive a variant from a previously generated primary image.
 */
const generateVariantFromPrimary = async (
  imageUrl: string,
  fullPrompt: string
): Promise<string> =>
  generateGeminiImageFromPrompt({ fullPrompt, remoteImageUrls: [imageUrl] });

export const generateVariantThrustersOffMuzzleOff = async (
  imageUrl: string
): Promise<string> =>
  generateVariantFromPrimary(
    imageUrl,
    `Using the provided image of a spaceship, please remove the thruster flame from the scene. Ensure you fill in the area of the thrusters that we originally hidden from the thruster flame and keep the rest of the image the same.`
  );

export const generateVariantThrustersOnMuzzleOn = async (
  imageUrl: string
): Promise<string> =>
  generateVariantFromPrimary(
    imageUrl,
    `Using the provided image of a spaceship, please add small muzzle flashes to ONLY the guns facing UP (0° rotation). Ensure you do not modify any other part of the spaceship.`
  );

// The variant thrustersOffMuzzleOn is now produced via image merging logic (see imageMerge.ts)
// and no longer generated directly by Gemini.

export const generateVariantThrustersOffMuzzleOn =
  async (): Promise<string> => {
    throw new Error(
      "generateVariantThrustersOffMuzzleOn is deprecated; use mergeTopBottomHalves util instead"
    );
  };
