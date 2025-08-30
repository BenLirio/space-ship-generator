import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { parseJsonBody, GenerateRequestBody } from "./utils";
import { buildSpaceShip } from "./generateSpaceShip";

export const generateSpaceShip = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const body = parseJsonBody<GenerateRequestBody>(event);

  if (!body || typeof body.prompt !== "string") {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: "Invalid body. Expected JSON { prompt: string }.",
      }),
    };
  }

  const prompt = body.prompt.trim();
  if (!prompt) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Prompt must be a non-empty string." }),
    };
  }

  const ship = await buildSpaceShip(prompt);

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      spaceship: ship,
      requestId: (event.requestContext as any)?.requestId,
    }),
  };
};
