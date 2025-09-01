import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { parseJsonBody, GenerateRequestBody } from "./utils";
import { generateSpaceShip as generateSpaceShipInternal } from "./buildSpaceShip"; // richer result
import { generateIdleThrustersOffVariant } from "./providers/geminiProvider";
import { putObjectIfAbsent, publicUrlForKey } from "./storage/s3Storage";

export const generateSpaceShip = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const body = parseJsonBody<GenerateRequestBody>(event);

  if (!body || typeof body.prompt !== "string") {
    return {
      statusCode: 400,
      headers: {
        "content-type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Invalid body. Expected JSON { prompt: string }.",
      }),
    };
  }

  const prompt = body.prompt.trim();
  if (!prompt) {
    return {
      statusCode: 400,
      headers: {
        "content-type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: "Prompt must be a non-empty string." }),
    };
  }

  // Generate the primary (thrusters on) image first
  const primary = await generateSpaceShipInternal(prompt);

  let idleUrl: string | undefined;
  try {
    const idleBase64 = await generateIdleThrustersOffVariant(primary.imageUrl);
    const idleKey = primary.objectKey.replace(/\.png$/, "-idle.png");
    await putObjectIfAbsent(
      idleKey,
      Buffer.from(idleBase64, "base64"),
      "image/png",
      { variant: "idle" }
    );
    idleUrl = publicUrlForKey(idleKey);
  } catch (err) {
    // Non-fatal: still return primary image; include an error hint if desired later
    console.error("Idle variant generation failed", err);
  }

  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      requestId: (event.requestContext as any)?.requestId,
      sprites: {
        idle: { url: idleUrl },
        thrusters: { url: primary.imageUrl },
      },
    }),
  };
};
