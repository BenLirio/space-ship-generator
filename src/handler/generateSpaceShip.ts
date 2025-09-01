import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { parseJsonBody, GenerateRequestBody } from "../utils";
import { generateSpaceShipAsset } from "../buildSpaceShip";
import { invalidBody, jsonResult, runSafely } from "./shared";

// NOTE: BREAKING CHANGE (v2): response sprite keys corrected (see MIGRATION.md)
export const generateSpaceShipHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> =>
  runSafely(event, async () => {
    const body = parseJsonBody<GenerateRequestBody>(event);
    if (!body || typeof body.prompt !== "string") {
      return invalidBody("Invalid body. Expected JSON { prompt: string }.");
    }

    const prompt = body.prompt.trim();
    if (!prompt) return invalidBody("Prompt must be a non-empty string.");

    const primary = await generateSpaceShipAsset(prompt);

    // Only the primary image is produced here. Variants come from generateSpriteSheet endpoint.
    return jsonResult(200, {
      requestId: (event.requestContext as any)?.requestId,
      sprites: {
        // Correct key names (thrusters/muzzle) with placeholders for future variant filling
        thrustersOnMuzzleOn: { url: primary.imageUrl },
      },
    });
  });
