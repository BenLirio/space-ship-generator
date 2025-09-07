import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

let docClient: DynamoDBDocumentClient | null = null;

export const getDynamoDocClient = () => {
  if (docClient) return docClient;
  const client = new DynamoDBClient({});
  docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
  return docClient;
};

export const SCOREBOARD_TABLE =
  process.env.SCOREBOARD_TABLE || "scoreboard-dev";
export const SCOREBOARD_GSI = "byScore";
