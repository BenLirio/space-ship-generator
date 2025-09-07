import {
  expandShipPrompt,
  generateImageWithGemini,
} from "./providers/geminiProvider";
import { putObjectIfAbsent, publicUrlForKey } from "./storage/s3Storage";
import { GenerationResult } from "./types";
import { randomUUID } from "crypto";

// Public high-level API replacing previous buildSpaceShip implementation.
export const buildSpaceShip = async (prompt: string): Promise<string> => {
  const result = await generateSpaceShipAsset(prompt);
  return result.imageUrl; // maintain old return shape for existing handler
};

// Core image generation returning structured result.
export const generateSpaceShipAsset = async (
  prompt: string
): Promise<GenerationResult> => {
  const id = randomUUID();
  const objectKey = `generated/${id}.png`;
  // Expand the user's prompt to reduce vagueness and enrich details.
  let expandedPrompt = prompt;
  try {
    expandedPrompt = await expandShipPrompt(prompt);
  } catch (e) {
    console.warn("Prompt expansion failed; falling back to raw prompt:", e);
  }
  const base64 = await generateImageWithGemini({ prompt: expandedPrompt });
  const buffer = Buffer.from(base64, "base64");
  await putObjectIfAbsent(objectKey, buffer, "image/png", {});
  return {
    prompt,
    objectKey,
    imageUrl: publicUrlForKey(objectKey),
  };
};
