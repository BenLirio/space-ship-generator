import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

export const JSON_HEADERS = {
  "content-type": "application/json",
  "Access-Control-Allow-Origin": "*",
} as const;

export const jsonResult = (
  statusCode: number,
  body: any
): APIGatewayProxyResult => ({
  statusCode,
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
});

export const invalidBody = (message: string) =>
  jsonResult(400, { error: message });

// Generic safe executor so individual handlers stay lean. Ensures JSON error on uncaught exception.
export const runSafely = async (
  _event: APIGatewayProxyEvent,
  fn: () => Promise<APIGatewayProxyResult>
): Promise<APIGatewayProxyResult> => {
  try {
    return await fn();
  } catch (e: any) {
    console.error("Unhandled handler error", e);
    return jsonResult(500, { error: e?.message || "Internal error" });
  }
};

export type LambdaHandler = (
  event: APIGatewayProxyEvent
) => Promise<APIGatewayProxyResult>;
