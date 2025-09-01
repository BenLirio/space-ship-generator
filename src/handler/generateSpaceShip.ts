import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { parseJsonBody, GenerateRequestBody } from "../utils";
import { generateSpaceShipAsset } from "../buildSpaceShip";
import { invalidBody, jsonResult, runSafely } from "./shared";

// Keeps output shape exactly the same as previous implementation (including typoed keys) for compatibility.
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

    // Only generate the primary sprite now. Variants are produced by the new generateSpriteSheet endpoint.
    return jsonResult(200, {
      requestId: (event.requestContext as any)?.requestId,
      sprites: {
        // Maintain legacy (typoed) keys & structure for backward compatibility
        trustersOnMuzzleOn: { url: primary.imageUrl }, // primary image
        trustersOfMuzzleOn: { url: undefined }, // variant placeholder (thrustersOff-muzzleOn)
        thrustersOnMuzzleOf: { url: undefined }, // variant placeholder (thrustersOn-muzzleOff)
        thrustersOfMuzzleOf: { url: undefined }, // variant placeholder (thrustersOff-muzzleOff)
      },
    });
  });
