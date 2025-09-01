import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { parseJsonBody } from "../utils";
import {
  generateVariantThrustersOnMuzzleOn,
  generateVariantThrustersOffMuzzleOff,
} from "../providers/geminiProvider";
import { putObjectIfAbsent, publicUrlForKey } from "../storage/s3Storage";
import { invalidBody, jsonResult, runSafely } from "./shared";
import { mergeTopBottomHalves } from "../imageMerge";

interface GenerateSpriteSheetBody {
  imageUrl: string; // primary image URL produced by generateSpaceShip endpoint
}

// Helper to derive original object key from a public S3 URL
const extractObjectKey = (url: string): string | null => {
  try {
    const u = new URL(url);
    // Expect path like /generated/<uuid>.png
    const key = u.pathname.replace(/^\//, "");
    if (!key.endsWith(".png")) return null;
    return key;
  } catch {
    return null;
  }
};

export const generateSpriteSheetHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> =>
  runSafely(event, async () => {
    const body = parseJsonBody<GenerateSpriteSheetBody>(event);
    if (!body || typeof body.imageUrl !== "string") {
      return invalidBody("Invalid body. Expected JSON { imageUrl: string }.");
    }

    const imageUrl = body.imageUrl.trim();
    if (!imageUrl) return invalidBody("imageUrl must be a non-empty string.");

    const baseKey = extractObjectKey(imageUrl);
    if (!baseKey) {
      return invalidBody(
        "imageUrl must be a valid PNG URL within this bucket."
      );
    }

    // The provided image is now considered the base: thrustersOnMuzzleOff.
    // We derive the remaining three variants.
    const [thrustersOnMuzzleOnP, thrustersOffMuzzleOffP] = [
      generateVariantThrustersOnMuzzleOn(imageUrl),
      generateVariantThrustersOffMuzzleOff(imageUrl),
    ];

    const variantBase64: Record<
      "thrustersOnMuzzleOn" | "thrustersOffMuzzleOff" | "thrustersOffMuzzleOn",
      string | undefined
    > = {
      thrustersOnMuzzleOn: undefined,
      thrustersOffMuzzleOff: undefined,
      thrustersOffMuzzleOn: undefined, // will be produced by merging
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
      settle("thrustersOnMuzzleOn", thrustersOnMuzzleOnP),
      settle("thrustersOffMuzzleOff", thrustersOffMuzzleOffP),
    ]);

    // Compose thrustersOffMuzzleOn by merging top half (muzzle flashes) from
    // thrustersOnMuzzleOn with bottom half (thrusters off) from thrustersOffMuzzleOff
    if (
      variantBase64.thrustersOnMuzzleOn &&
      variantBase64.thrustersOffMuzzleOff
    ) {
      try {
        variantBase64.thrustersOffMuzzleOn = await mergeTopBottomHalves(
          variantBase64.thrustersOnMuzzleOn,
          variantBase64.thrustersOffMuzzleOff
        );
      } catch (e) {
        console.error(
          "Failed to merge images for thrustersOffMuzzleOn variant",
          e
        );
      }
    }

    const spriteUrls: Record<string, { url?: string }> = {
      // Provided base image
      thrustersOnMuzzleOff: { url: imageUrl },
      thrustersOnMuzzleOn: { url: undefined },
      thrustersOffMuzzleOn: { url: undefined },
      thrustersOffMuzzleOff: { url: undefined },
    };

    const persistVariant = async (
      label: keyof typeof variantBase64,
      responseKey: keyof typeof spriteUrls,
      suffix: string
    ) => {
      const b64 = variantBase64[label];
      if (!b64) return;
      const key = baseKey.replace(/\.png$/, `${suffix}.png`);
      await putObjectIfAbsent(key, Buffer.from(b64, "base64"), "image/png", {
        variant: responseKey as string,
      });
      spriteUrls[responseKey].url = publicUrlForKey(key);
    };

    await Promise.all([
      persistVariant(
        "thrustersOnMuzzleOn",
        "thrustersOnMuzzleOn",
        "-thrustersOn-muzzleOn"
      ),
      persistVariant(
        "thrustersOffMuzzleOn",
        "thrustersOffMuzzleOn",
        "-thrustersOff-muzzleOn"
      ),
      persistVariant(
        "thrustersOffMuzzleOff",
        "thrustersOffMuzzleOff",
        "-thrustersOff-muzzleOff"
      ),
    ]);

    return jsonResult(200, {
      requestId: (event.requestContext as any)?.requestId,
      sprites: spriteUrls,
    });
  });
