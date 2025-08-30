// Utility helpers for Lambda handlers and generation logic
import { APIGatewayProxyEvent } from "aws-lambda";

export interface GenerateRequestBody {
  prompt: string;
  // Future fields (e.g., seed, style) can be added here
}

export const parseJsonBody = <T = unknown>(
  event: APIGatewayProxyEvent
): T | null => {
  if (!event.body) return null;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

// Very small, deterministic string hash for component selection
export const stringHash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0; // unsigned
  }
  return h;
};

// Removed pickDeterministic + SpaceShip interface after simplification.
