import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { jsonResult, invalidBody, runSafely } from "./shared";
import { expandShipPrompt } from "../providers/geminiProvider";

export const expandPromptHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> =>
  runSafely(event, async () => {
    if (!event.body)
      return invalidBody("Invalid body. Expected JSON { prompt: string }.");
    let prompt = "";
    try {
      const parsed = event.isBase64Encoded
        ? JSON.parse(Buffer.from(event.body, "base64").toString("utf8"))
        : JSON.parse(event.body);
      prompt = String(parsed?.prompt || "").trim();
    } catch {
      return invalidBody("Invalid JSON body.");
    }

    if (!prompt) return invalidBody("Prompt must be a non-empty string.");

    const expandedPrompt = await expandShipPrompt(prompt);
    return jsonResult(200, { expandedPrompt });
  });
