import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { jsonResult, runSafely } from "./shared";
import { getHardCap, getRemainingForIp } from "../storage/ipUsageRepo";

export const getNumRemainingShipsHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> =>
  runSafely(event, async () => {
    const ip = (event.headers["x-client-ip"] ||
      event.headers["X-Client-Ip"]) as string | undefined;
    if (!ip) return jsonResult(400, { error: "Missing x-client-ip header" });

    const remaining = await getRemainingForIp(ip);
    return jsonResult(200, {
      ip,
      remaining,
      cap: getHardCap(),
    });
  });
