import { generateImageWithGemini } from "./providers/geminiProvider";
import { putObjectIfAbsent, publicUrlForKey } from "./storage/s3Storage";
import { GenerationResult } from "./types";
import { randomUUID } from "crypto";

// Public high-level API replacing previous buildSpaceShip implementation.
export const buildSpaceShip = async (prompt: string): Promise<string> => {
  const result = await generateSpaceShip(prompt);
  return result.imageUrl; // maintain old return shape for existing handler
};

export const generateSpaceShip = async (
  prompt: string
): Promise<GenerationResult> => {
  const id = randomUUID();
  const objectKey = `generated/${id}.png`;
  const base64 = await generateImageWithGemini({ prompt });
  const buffer = Buffer.from(base64, "base64");
  await putObjectIfAbsent(objectKey, buffer, "image/png", {});
  return {
    prompt,
    objectKey,
    imageUrl: publicUrlForKey(objectKey),
  };
};
