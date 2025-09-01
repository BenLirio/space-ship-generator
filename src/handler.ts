import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { parseJsonBody, GenerateRequestBody } from "./utils";
import {
  computeDiffBoundingBoxes,
  DiffBoundingBoxRequestBody,
} from "./diffBoundingBox";
import { generateSpaceShipAsset } from "./buildSpaceShip"; // core generation returning GenerationResult
import {
  generateVariantThrustersOffMuzzleOn,
  generateVariantThrustersOnMuzzleOff,
  generateVariantThrustersOffMuzzleOff,
} from "./providers/geminiProvider";
import { putObjectIfAbsent, publicUrlForKey } from "./storage/s3Storage";

// ---------------------------------------------------------------------------
// Shared HTTP helpers (keep responses consistent & reduce duplication)
// ---------------------------------------------------------------------------
const JSON_HEADERS = {
  "content-type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

const jsonResult = (statusCode: number, body: any): APIGatewayProxyResult => ({
  statusCode,
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
});

const invalidBody = (message: string) => jsonResult(400, { error: message });

// Generic safe executor so individual handlers stay lean. Ensures JSON error on exception.
const runSafely = async (
  event: APIGatewayProxyEvent,
  fn: () => Promise<APIGatewayProxyResult>
): Promise<APIGatewayProxyResult> => {
  try {
    return await fn();
  } catch (e: any) {
    console.error("Unhandled handler error", e);
    return jsonResult(500, { error: e?.message || "Internal error" });
  }
};

// Renamed to avoid clashing with internal generation function name.
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

    // Generate the primary (thrustersOn + muzzleOn) image first (required reference)
    const primary = await generateSpaceShipAsset(prompt);

    // Variant generation prompts (run in parallel)
    const [
      thrustersOffMuzzleOnP,
      thrustersOnMuzzleOffP,
      thrustersOffMuzzleOffP,
    ] = [
      generateVariantThrustersOffMuzzleOn(primary.imageUrl),
      generateVariantThrustersOnMuzzleOff(primary.imageUrl),
      generateVariantThrustersOffMuzzleOff(primary.imageUrl),
    ];

    // Await all, capturing failures individually (continue best-effort)
    const variantBase64: Record<string, string | undefined> = {
      thrustersOffMuzzleOn: undefined,
      thrustersOnMuzzleOff: undefined,
      thrustersOffMuzzleOff: undefined,
    };

    const settle = async (
      label: keyof typeof variantBase64,
      p: Promise<string>
    ) => {
      try {
        variantBase64[label] = await p;
      } catch (e) {
        console.error(`Variant generation failed for ${label}`, e);
      }
    };

    await Promise.all([
      settle("thrustersOffMuzzleOn", thrustersOffMuzzleOnP),
      settle("thrustersOnMuzzleOff", thrustersOnMuzzleOffP),
      settle("thrustersOffMuzzleOff", thrustersOffMuzzleOffP),
    ]);

    // Persist each successful variant
    const spriteUrls: Record<string, { url?: string }> = {
      trustersOnMuzzleOn: { url: primary.imageUrl },
      trustersOfMuzzleOn: { url: undefined },
      thrustersOnMuzzleOf: { url: undefined },
      thrustersOfMuzzleOf: { url: undefined },
    };

    const persistVariant = async (
      label: keyof typeof variantBase64,
      responseKey: keyof typeof spriteUrls,
      suffix: string
    ) => {
      const b64 = variantBase64[label];
      if (!b64) return;
      const key = primary.objectKey.replace(/\.png$/, `${suffix}.png`);
      await putObjectIfAbsent(key, Buffer.from(b64, "base64"), "image/png", {
        variant: responseKey as string,
      });
      spriteUrls[responseKey].url = publicUrlForKey(key);
    };

    await Promise.all([
      persistVariant(
        "thrustersOffMuzzleOn",
        "trustersOfMuzzleOn",
        "-thrustersOff-muzzleOn"
      ),
      persistVariant(
        "thrustersOnMuzzleOff",
        "thrustersOnMuzzleOf",
        "-thrustersOn-muzzleOff"
      ),
      persistVariant(
        "thrustersOffMuzzleOff",
        "thrustersOfMuzzleOf",
        "-thrustersOff-muzzleOff"
      ),
    ]);

    return jsonResult(200, {
      requestId: (event.requestContext as any)?.requestId,
      sprites: spriteUrls,
    });
  });

export const diffBoundingBoxHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> =>
  runSafely(event, async () => {
    const body = parseJsonBody<DiffBoundingBoxRequestBody>(event);
    if (
      !body ||
      typeof body.imageUrlA !== "string" ||
      typeof body.imageUrlB !== "string"
    ) {
      return invalidBody(
        "Invalid body. Expected JSON { imageUrlA: string, imageUrlB: string, threshold?, minBoxArea? }"
      );
    }
    try {
      const result = await computeDiffBoundingBoxes(body);
      return jsonResult(200, result);
    } catch (e: any) {
      console.error("diffBoundingBox error", e);
      // Preserve previous semantics: 400 on computation failure
      return jsonResult(400, { error: e?.message || "Failed to compute diff" });
    }
  });
