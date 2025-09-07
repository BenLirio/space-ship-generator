import { APIGatewayProxyEvent } from "aws-lambda";
import { invalidBody, jsonResult, runSafely } from "./shared";
import { upsertScore } from "../storage/scoreboardRepo";

export const scoreboardSetHandler = async (event: APIGatewayProxyEvent) =>
  runSafely(event, async () => {
    if (!event.body) return invalidBody("Missing JSON body");
    let payload: any;
    try {
      payload = JSON.parse(event.body);
    } catch {
      return invalidBody("Body must be valid JSON");
    }

    const { id, name, score, shipImageUrl } = payload || {};
    if (!id || typeof id !== "string")
      return invalidBody("id (string) is required");
    if (!name || typeof name !== "string")
      return invalidBody("name (string) is required");
    if (typeof score !== "number")
      return invalidBody("score (number) is required");
    if (!shipImageUrl || typeof shipImageUrl !== "string")
      return invalidBody("shipImageUrl (string) is required");

    const item = await upsertScore({ id, name, score, shipImageUrl });
    return jsonResult(200, { ok: true, item });
  });
