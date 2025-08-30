import { EXAMPLE_IMAGE_PATHS } from "./config";
import { resolveAssetPath } from "./assetResolver";
import { readFileSync } from "fs";

export const loadDeterministicPlaceholder = (
  seed: number
): { buffer: Buffer; fileName: string } => {
  const chosen = EXAMPLE_IMAGE_PATHS[seed % EXAMPLE_IMAGE_PATHS.length];
  const path = resolveAssetPath(chosen);
  return {
    buffer: readFileSync(path),
    fileName: chosen.split(/\//).pop() || chosen,
  };
};
