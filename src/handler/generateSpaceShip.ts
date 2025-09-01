import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { parseJsonBody, GenerateRequestBody } from "../utils";
import { generateSpaceShipAsset } from "../buildSpaceShip";
import {
  generateVariantThrustersOffMuzzleOn,
  generateVariantThrustersOnMuzzleOff,
  generateVariantThrustersOffMuzzleOff,
} from "../providers/geminiProvider";
import { putObjectIfAbsent, publicUrlForKey } from "../storage/s3Storage";
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

    const [
      thrustersOffMuzzleOnP,
      thrustersOnMuzzleOffP,
      thrustersOffMuzzleOffP,
    ] = [
      generateVariantThrustersOffMuzzleOn(primary.imageUrl),
      generateVariantThrustersOnMuzzleOff(primary.imageUrl),
      generateVariantThrustersOffMuzzleOff(primary.imageUrl),
    ];

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
