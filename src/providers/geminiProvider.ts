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
export const generateGeminiImageFromPrompt = async (
  fullPrompt: string,
  referenceImagePaths: string[]
): Promise<string> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY env var");
  const gemini = new GoogleGenAI({ apiKey });

  const referenceImages = referenceImagePaths
    .map(loadImageAsBase64)
    .map((ref) => ({
      inlineData: { mimeType: ref.mimeType, data: ref.base64 },
    }));

  const content = [{ text: fullPrompt }, ...referenceImages];

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
  return generateGeminiImageFromPrompt(fullPrompt, EXAMPLE_IMAGE_PATHS);
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY env var");
  const gemini = new GoogleGenAI({ apiKey });

  // Fetch existing generated image
  const resp = await fetch(imageUrl);
  if (!resp.ok) {
    throw new Error(
      `Failed to fetch base image for idle variant: ${resp.status}`
    );
  }
  const arrayBuffer = await resp.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  const fullPrompt = `Make this exact image, but the only change is that the thrusters are turned off. Preserve: orientation (strict top-down), framing, proportions, colors (except remove/adjust any active thruster glow), line style, shading approach, background (#000000 pure). ${ENFORCED_STYLE_CONSTRAINTS}`;

  const content: any[] = [
    { text: fullPrompt },
    {
      inlineData: { mimeType: "image/png", data: base64 },
    },
  ];

  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: content as any,
  });

  let out: string | undefined;
  if (response?.candidates) {
    for (const c of response.candidates) {
      const parts: any[] = (c as any).content?.parts || [];
      for (const p of parts) {
        if (p.inlineData?.data) {
          out = p.inlineData.data;
          break;
        }
      }
      if (out) break;
    }
  }
  if (!out) throw new Error("Gemini idle variant response lacked image data");
  return out;
};
