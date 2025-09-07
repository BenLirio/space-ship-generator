import { APIGatewayProxyEvent } from "aws-lambda";
import { jsonResult, runSafely } from "./shared";
import { listTopScores } from "../storage/scoreboardRepo";

export const scoreboardListHandler = async (event: APIGatewayProxyEvent) =>
  runSafely(event, async () => {
    const maxItemsParam = event.queryStringParameters?.maxItems;
    const n = Math.max(1, Math.min(100, Number(maxItemsParam ?? 25)));
    const items = await listTopScores(n);
    return jsonResult(200, { items, count: items.length });
  });
