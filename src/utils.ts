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

// Removed legacy helpers (stringHash, pickDeterministic, SpaceShip interface) after simplification.
