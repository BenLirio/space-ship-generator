import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamoDocClient, IP_USAGE_TABLE } from "./dynamo";

export interface IpUsageRecord {
  ip: string;
  count: number; // total calls made
  // reserved for future: firstSeen, lastSeen timestamps, etc.
}

const HARD_CAP = 5;

/**
 * Atomically increments count for the given IP if below HARD_CAP.
 * Returns the new count on success, or null if cap is exceeded (no change made).
 */
export async function tryIncrementIpUsage(ip: string): Promise<number | null> {
  const ddb = getDynamoDocClient();

  // First, attempt a conditional update if the item exists and is below cap
  try {
    const resp = await ddb.send(
      new UpdateCommand({
        TableName: IP_USAGE_TABLE,
        Key: { ip },
        UpdateExpression: "SET #c = #c + :one",
        ConditionExpression: "attribute_exists(#ip) AND #c < :cap",
        ExpressionAttributeNames: { "#c": "count", "#ip": "ip" },
        ExpressionAttributeValues: { ":one": 1, ":cap": HARD_CAP },
        ReturnValues: "UPDATED_NEW",
      })
    );
    const newCount = (resp.Attributes?.count as number) ?? null;
    return newCount;
  } catch (err: any) {
    const code = err?.name || err?.code;
    if (code !== "ConditionalCheckFailedException") {
      throw err;
    }
    // Either item doesn't exist or already at/over cap.
  }

  // If item doesn't exist, create it with count = 1 atomically
  try {
    await ddb.send(
      new PutCommand({
        TableName: IP_USAGE_TABLE,
        Item: { ip, count: 1 },
        ConditionExpression: "attribute_not_exists(ip)",
      })
    );
    return 1;
  } catch (err: any) {
    const code = err?.name || err?.code;
    if (code !== "ConditionalCheckFailedException") throw err;
    // Lost race: item exists now. Fetch to see if under cap and retry one last time.
  }

  // Fetch current count
  const got = await ddb.send(
    new GetCommand({ TableName: IP_USAGE_TABLE, Key: { ip } })
  );
  const current = (got.Item?.count as number) || 0;
  if (current >= HARD_CAP) return null;

  // Try one final conditional update from current
  try {
    const resp = await ddb.send(
      new UpdateCommand({
        TableName: IP_USAGE_TABLE,
        Key: { ip },
        UpdateExpression: "SET #c = :next",
        ConditionExpression: "#c = :cur AND #c < :cap",
        ExpressionAttributeNames: { "#c": "count" },
        ExpressionAttributeValues: {
          ":cur": current,
          ":next": current + 1,
          ":cap": HARD_CAP,
        },
        ReturnValues: "UPDATED_NEW",
      })
    );
    return (resp.Attributes?.count as number) ?? null;
  } catch (err: any) {
    const code = err?.name || err?.code;
    if (code === "ConditionalCheckFailedException") return null;
    throw err;
  }
}

export function getHardCap() {
  return HARD_CAP;
}

/**
 * Returns the current usage count for an IP. If not found, returns 0.
 */
export async function getIpUsageCount(ip: string): Promise<number> {
  const ddb = getDynamoDocClient();
  const got = await ddb.send(
    new GetCommand({ TableName: IP_USAGE_TABLE, Key: { ip } })
  );
  return (got.Item?.count as number) ?? 0;
}

/**
 * Returns remaining allowed generations for an IP (HARD_CAP - count), never below 0.
 */
export async function getRemainingForIp(ip: string): Promise<number> {
  const used = await getIpUsageCount(ip);
  return Math.max(0, HARD_CAP - used);
}
