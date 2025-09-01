import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { parseJsonBody } from "../utils";
import {
  computeDiffBoundingBoxes,
  DiffBoundingBoxRequestBody,
} from "../diffBoundingBox";
import { invalidBody, jsonResult, runSafely } from "./shared";

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
      return jsonResult(400, { error: e?.message || "Failed to compute diff" });
    }
  });
