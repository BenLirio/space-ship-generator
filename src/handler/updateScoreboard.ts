import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { jsonResult, invalidBody, runSafely } from "./shared";
import { ddb, SCOREBOARD_TABLE } from "../storage/dynamo";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ScoreRecord } from "../types";

export const updateScoreboardHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> =>
  runSafely(event, async () => {
    if (!event.body)
      return invalidBody(
        "Invalid body. Expected JSON { id: string, name: string, score: number, shipImageUrl: string }."
      );

    let payload: ScoreRecord | null = null;
    try {
      const raw = event.isBase64Encoded
        ? Buffer.from(event.body, "base64").toString("utf8")
        : event.body;
      payload = JSON.parse(raw);
    } catch {
      return invalidBody("Invalid JSON body.");
    }

    if (!payload)
      return invalidBody("Missing body.");

    const { id, name, score, shipImageUrl } = payload as any;

    if (!id || typeof id !== "string")
      return invalidBody("id must be a non-empty string");
    if (!name || typeof name !== "string")
      return invalidBody("name must be a non-empty string");
    if (typeof score !== "number")
      return invalidBody("score must be a number");
    if (!shipImageUrl || typeof shipImageUrl !== "string")
      return invalidBody("shipImageUrl must be a non-empty string");

    const now = new Date().toISOString();
    const item: ScoreRecord & { pk: string; sk: number; createdAt: string } = {
      id,
      name,
      score,
      shipImageUrl,
      createdAt: now,
      // PK for single-table design, SK as negative score to sort high->low with ascending queries if needed
      pk: "SCOREBOARD",
      sk: -score,
    };

    await ddb.send(
      new PutCommand({
        TableName: SCOREBOARD_TABLE,
        Item: item,
      })
    );

    return jsonResult(200, { ok: true });
  });
