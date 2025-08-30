// Shared domain types for the spaceship generator

export interface GenerationResult {
  prompt: string;
  seed: number;
  name: string; // Human friendly name e.g. SS-Falcon
  objectKey: string; // S3 key actually used
  imageUrl: string; // Public URL
  source: "gemini" | "placeholder";
  model?: string; // Model name when source === gemini
}

export interface ShipIdentity {
  seed: number;
  normalizedPrompt: string;
  name: string;
  keyBase: string; // used for generated/<keyBase>.png etc.
}
