import { GoogleGenAI } from "@google/genai";
import {
  ENFORCED_STYLE_CONSTRAINTS,
  GEMINI_MODEL,
  EXAMPLE_IMAGE_PATHS,
} from "../config";
import { loadImageAsBase64 } from "../assetResolver";

export interface GeminiGenerationOptions {
  prompt: string;
}

export const generateImageWithGemini = async ({
  prompt,
}: GeminiGenerationOptions): Promise<string> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY env var");
  const gemini = new GoogleGenAI({ apiKey });

  const referenceImages = EXAMPLE_IMAGE_PATHS.map(loadImageAsBase64).map(
    (ref) => ({
      inlineData: { mimeType: ref.mimeType, data: ref.base64 },
    })
  );

  const content = [
    {
      text: `Generate a spaceship consistent with the visual style cues of ALL provided reference images (they are variations of the same art style). User concept: ${prompt}. ${ENFORCED_STYLE_CONSTRAINTS}`,
    },
    ...referenceImages,
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
