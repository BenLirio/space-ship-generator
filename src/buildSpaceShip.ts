import { computeShipIdentity } from "./identity";
import { generateImageWithGemini } from "./providers/geminiProvider";
import { loadDeterministicPlaceholder } from "./fallback";
import { putObjectIfAbsent, publicUrlForKey } from "./storage/s3Storage";
import { GenerationResult } from "./types";

// Public high-level API replacing previous buildSpaceShip implementation.
export const buildSpaceShip = async (prompt: string): Promise<string> => {
  const result = await generateSpaceShip(prompt);
  return result.imageUrl; // maintain old return shape for existing handler
};

export const generateSpaceShip = async (
  prompt: string
): Promise<GenerationResult> => {
  const identity = computeShipIdentity(prompt);
  const { keyBase, seed, name } = identity;

  // Attempt model generation first
  try {
    const { base64, model } = await generateImageWithGemini({ prompt });
    const buffer = Buffer.from(base64, "base64");
    const objectKey = `generated/${keyBase}.png`;
    await putObjectIfAbsent(objectKey, buffer, "image/png", {
      source: "gemini",
      model,
    });
    return {
      prompt,
      seed,
      name,
      objectKey,
      imageUrl: publicUrlForKey(objectKey),
      source: "gemini",
      model,
    };
  } catch {
    // Fallback path
    const { buffer, fileName } = loadDeterministicPlaceholder(seed);
    const objectKey = `placeholders/${keyBase}.png`;
    await putObjectIfAbsent(objectKey, buffer, "image/png", {
      source: "placeholder",
      file: fileName,
    });
    return {
      prompt,
      seed,
      name,
      objectKey,
      imageUrl: publicUrlForKey(objectKey),
      source: "placeholder",
    };
  }
};
