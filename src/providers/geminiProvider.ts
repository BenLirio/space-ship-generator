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
