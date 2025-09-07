import {
  BatchWriteCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDynamoDocClient, SCOREBOARD_TABLE, SCOREBOARD_GSI } from "./dynamo";

export interface ScoreRecord {
  id: string;
  name: string;
  score: number;
  shipImageUrl: string;
}

// We use a static GSI partition key to support sorting by score globally.
const GSI_PK_VALUE = "GLOBAL";

export async function upsertScore(record: ScoreRecord) {
  const ddb = getDynamoDocClient();
  // Remove any previous entries for this id to emulate true upsert semantics
  const existing = await ddb.send(
    new QueryCommand({
      TableName: SCOREBOARD_TABLE,
      KeyConditionExpression: "id = :id",
      ExpressionAttributeValues: { ":id": record.id },
      ProjectionExpression: "id, #s",
      ExpressionAttributeNames: { "#s": "score" },
    })
  );
  const toDelete = (existing.Items || []).map((it) => ({
    DeleteRequest: { Key: { id: it.id, score: it.score } },
  }));
  if (toDelete.length) {
    // BatchWrite in chunks of 25
    for (let i = 0; i < toDelete.length; i += 25) {
      const chunk = toDelete.slice(i, i + 25);
      await ddb.send(
        new BatchWriteCommand({
          RequestItems: { [SCOREBOARD_TABLE]: chunk },
        })
      );
    }
  }

  const item = {
    ...record,
    // Fields for GSI to sort by score globally
    gsiPK: GSI_PK_VALUE,
  } as const;
  await ddb.send(
    new PutCommand({
      TableName: SCOREBOARD_TABLE,
      Item: item,
    })
  );
  return item;
}

export async function listTopScores(maxItems: number): Promise<ScoreRecord[]> {
  const ddb = getDynamoDocClient();
  const resp = await ddb.send(
    new QueryCommand({
      TableName: SCOREBOARD_TABLE,
      IndexName: SCOREBOARD_GSI,
      KeyConditionExpression: "gsiPK = :p",
      ExpressionAttributeValues: { ":p": GSI_PK_VALUE },
      // Query sorts by sort key ascending by default; use ScanIndexForward=false for descending
      ScanIndexForward: false,
      Limit: Math.max(1, Math.min(100, maxItems || 25)),
    })
  );
  const items = (resp.Items as any[]) || [];
  return items.map((it) => ({
    id: it.id,
    name: it.name,
    score: it.score,
    shipImageUrl: it.shipImageUrl,
  }));
}
