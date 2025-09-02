import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { parseJsonBody } from "../utils";
import { invalidBody, jsonResult, runSafely } from "./shared";
import Jimp from "jimp";
import { createHash, randomUUID } from "crypto";
import {
  putObjectIfAbsent,
  publicUrlForKey,
  objectExists,
} from "../storage/s3Storage";

interface ResizeRequestBody {
  imageUrls: string[];
  // Maximum bounding box dimensions to fit image into while preserving aspect
  maxWidth?: number; // default 128
  maxHeight?: number; // default 128
  // If true, will always upload even if an object with same deterministic key exists (cache-bypass)
  force?: boolean;
}

interface ResizeItemSuccess {
  sourceUrl: string;
  resizedUrl: string;
  objectKey: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  reusedExisting: boolean;
}

interface ResizeItemError {
  sourceUrl: string;
  error: string;
}

interface ResizeResponseBody {
  requestId?: string;
  items: ResizeItemSuccess[];
  errors?: ResizeItemError[];
  params: { maxWidth: number; maxHeight: number };
}

// Deterministic object key for caching: hash(url + size params)
const keyFor = (url: string, w: number, h: number) => {
  const hsh = createHash("sha256")
    .update(url + `:${w}x${h}`)
    .digest("hex");
  return `resized/${hsh.substring(0, 40)}.png`;
};

export const resizeHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> =>
  runSafely(event, async () => {
    const body = parseJsonBody<ResizeRequestBody>(event);
    if (
      !body ||
      !Array.isArray(body.imageUrls) ||
      body.imageUrls.length === 0
    ) {
      return invalidBody(
        "Invalid body. Expected JSON { imageUrls: string[], maxWidth?, maxHeight?, force? }."
      );
    }
    const maxWidth = Math.min(Math.max(body.maxWidth ?? 128, 1), 4096);
    const maxHeight = Math.min(Math.max(body.maxHeight ?? 128, 1), 4096);

    const successes: ResizeItemSuccess[] = [];
    const errors: ResizeItemError[] = [];

    for (const url of body.imageUrls) {
      if (typeof url !== "string" || !url.trim()) {
        errors.push({ sourceUrl: String(url), error: "Invalid URL string" });
        continue;
      }
      try {
        const img = await Jimp.read(url);
        const origW = img.getWidth();
        const origH = img.getHeight();
        // Compute scale factor to fit inside box while preserving aspect
        const scale = Math.min(maxWidth / origW, maxHeight / origH, 1); // don't upscale
        const targetW = Math.max(1, Math.floor(origW * scale));
        const targetH = Math.max(1, Math.floor(origH * scale));

        let objectKey = keyFor(url, targetW, targetH);
        if (body.force) {
          objectKey = `resized/${randomUUID()}-${targetW}x${targetH}.png`;
        }

        const cloned = img.clone();
        if (scale < 1) {
          cloned.resize(targetW, targetH);
        }
        const buffer = await cloned.getBufferAsync(Jimp.MIME_PNG);
        const existingKey = objectKey; // deterministic unless force
        const beforeUploadUrl = publicUrlForKey(existingKey);
        const existedBefore = !body.force && (await objectExists(objectKey));
        // put only if absent to leverage caching (unless force)
        await putObjectIfAbsent(objectKey, buffer, "image/png", {
          source_url: url.substring(0, 1024),
          original_width: String(origW),
          original_height: String(origH),
          target_width: String(targetW),
          target_height: String(targetH),
        });
        const resizedUrl = beforeUploadUrl;
        successes.push({
          sourceUrl: url,
          resizedUrl,
          objectKey,
          width: targetW,
          height: targetH,
          originalWidth: origW,
          originalHeight: origH,
          reusedExisting: existedBefore,
        });
      } catch (e: any) {
        errors.push({
          sourceUrl: url,
          error: e?.message || "Failed to resize",
        });
      }
    }

    const response: ResizeResponseBody = {
      requestId: (event.requestContext as any)?.requestId,
      items: successes,
      params: { maxWidth, maxHeight },
      ...(errors.length ? { errors } : {}),
    };
    // If all failed treat as 400
    if (!successes.length) {
      return jsonResult(400, response);
    }
    return jsonResult(200, response);
  });
