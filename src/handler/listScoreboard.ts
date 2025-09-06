import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { jsonResult, invalidBody, runSafely } from "./shared";
import { ddb, SCOREBOARD_TABLE } from "../storage/dynamo";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";

export const listScoreboardHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> =>
  runSafely(event, async () => {
    // Accept maxItems in JSON body for POST; also allow query param ?maxItems=NUMBER for convenience
    let maxItems: number | null = null;
    if (event.queryStringParameters?.maxItems) {
      const n = Number(event.queryStringParameters.maxItems);
      if (!Number.isNaN(n) && n > 0) maxItems = Math.min(n, 100);
    }
    if (!maxItems) {
      if (event.body) {
        try {
          const raw = event.isBase64Encoded
            ? Buffer.from(event.body, "base64").toString("utf8")
            : event.body;
          const parsed = JSON.parse(raw);
          const n = Number(parsed?.maxItems);
          if (!Number.isNaN(n) && n > 0) maxItems = Math.min(n, 100);
        } catch {
          // ignore, will fall back to default
        }
      }
    }

    const limit = maxItems ?? 25;

    // Query primary partition with ascending SK (-score), which returns highest score first.
  const res = await ddb.send(
      new QueryCommand({
        TableName: SCOREBOARD_TABLE,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: {
          ":pk": "SCOREBOARD",
        },
        Limit: limit,
        ScanIndexForward: true,
      })
    );

  const items = ((res.Items || []) as any[]).map((it) => ({
      id: it.id,
      name: it.name,
      score: it.score,
      shipImageUrl: it.shipImageUrl,
      createdAt: it.createdAt,
    }));

    return jsonResult(200, { items });
  });
