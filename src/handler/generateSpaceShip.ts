import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { parseJsonBody, GenerateRequestBody } from "../utils";
import { generateSpaceShipAsset } from "../buildSpaceShip";
import { invalidBody, jsonResult, runSafely } from "./shared";
import { tryIncrementIpUsage, getHardCap } from "../storage/ipUsageRepo";

// NOTE: BREAKING CHANGE (v2): response sprite keys corrected (see MIGRATION.md)
export const generateSpaceShipHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> =>
  runSafely(event, async () => {
    const ip = (event.headers["x-client-ip"] ||
      event.headers["X-Client-Ip"]) as string | undefined;
    if (!ip) {
      // If no IP header, deny by default to prevent bypass
      return jsonResult(400, { error: "Missing x-client-ip header" });
    }
    const newCount = await tryIncrementIpUsage(ip);
    if (newCount === null) {
      return jsonResult(429, {
        error: `Rate limit reached for IP. Max ${getHardCap()} lifetime requests per IP.`,
      });
    }
    const body = parseJsonBody<GenerateRequestBody>(event);
    if (!body || typeof body.prompt !== "string") {
      return invalidBody("Invalid body. Expected JSON { prompt: string }.");
    }

    const prompt = body.prompt.trim();
    if (!prompt) return invalidBody("Prompt must be a non-empty string.");

    const primary = await generateSpaceShipAsset(prompt);

    // Only the primary image is produced here (now: thrustersOnMuzzleOff base). Variants come from generateSpriteSheet endpoint.
    return jsonResult(200, {
      requestId: (event.requestContext as any)?.requestId,
      usage: { ip, used: newCount, cap: getHardCap() },
      sprites: {
        thrustersOnMuzzleOff: { url: primary.imageUrl },
      },
    });
  });
