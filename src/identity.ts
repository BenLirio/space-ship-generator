import { stringHash } from "./utils";
import { ShipIdentity } from "./types";

export const computeShipIdentity = (prompt: string): ShipIdentity => {
  const normalizedPrompt = prompt.trim().toLowerCase();
  const seed = stringHash(normalizedPrompt);
  const normalizedClean = normalizedPrompt
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/gi, "")
    .slice(0, 24);
  const base = normalizedClean || "Vessel";
  const name = `SS-${base}`;
  const keyBase = `${name}-${seed}`;
  return { seed, normalizedPrompt, name, keyBase };
};
