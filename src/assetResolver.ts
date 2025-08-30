import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

// Resolve an asset path when running from ts-node, compiled dist, or lambda bundle.
export const resolveAssetPath = (relative: string): string => {
  const attemptA = resolve(__dirname, "../", relative); // compiled layout
  if (existsSync(attemptA)) return attemptA;
  const attemptB = resolve(process.cwd(), relative); // project root
  if (existsSync(attemptB)) return attemptB;
  const attemptC = resolve(
    __dirname,
    relative.split(/\\|\//).pop() || relative
  );
  if (existsSync(attemptC)) return attemptC;
  throw new Error(`Asset not found: ${relative}`);
};

export interface LoadedImageRef {
  path: string;
  base64: string;
  mimeType: string;
}

export const loadImageAsBase64 = (relative: string): LoadedImageRef => {
  const p = resolveAssetPath(relative);
  return {
    path: p,
    base64: readFileSync(p).toString("base64"),
    mimeType: "image/png",
  };
};
