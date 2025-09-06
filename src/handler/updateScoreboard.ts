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

    if (!payload) return invalidBody("Missing body.");

    const { id, name, score, shipImageUrl } = payload as any;

    if (!id || typeof id !== "string")
      return invalidBody("id must be a non-empty string");
    if (!name || typeof name !== "string")
      return invalidBody("name must be a non-empty string");
    if (typeof score !== "number") return invalidBody("score must be a number");
    if (!shipImageUrl || typeof shipImageUrl !== "string")
      return invalidBody("shipImageUrl must be a non-empty string");

    const now = new Date().toISOString();
    // Use partition key constant and numeric sort key for leaderboard by score
    // Use integer sk = score*1000 + tieBreaker to avoid collisions on same score
    // Attempt conditional put; if key exists, increment tieBreaker and retry
    const base = Math.round(score * 1000);
    let attempt = 0;
    const maxAttempts = 20; // allow up to 20 collisions at the same score
    let lastError: unknown = null;
    while (attempt < maxAttempts) {
      const sk = base + attempt; // stable, ordered primarily by score
      const item: ScoreRecord & {
        pk: string;
        sk: number;
        createdAt: string;
      } = {
        id,
        name,
        score,
        shipImageUrl,
        createdAt: now,
        pk: "SCOREBOARD",
        sk,
      };

      try {
        await ddb.send(
          new PutCommand({
            TableName: SCOREBOARD_TABLE,
            Item: item,
            ConditionExpression:
              "attribute_not_exists(pk) AND attribute_not_exists(sk)",
          })
        );
        lastError = null;
        break;
      } catch (err: any) {
        // If collision, try next tiebreaker; otherwise rethrow
        const code = err?.name || err?.code || err?.__type;
        if (
          code === "ConditionalCheckFailedException" ||
          code ===
            "com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException"
        ) {
          attempt += 1;
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    if (lastError) {
      // Exhausted retries
      throw lastError;
    }

    return jsonResult(200, { ok: true });
  });
