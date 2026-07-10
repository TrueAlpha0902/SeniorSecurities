import { listQuestionOverrides } from "./_questionOverrides.js";
import { getAdminClient, sendError, sendJson, type ApiRequest, type ApiResponse } from "./_adminClient.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const overrides = await listQuestionOverrides(getAdminClient());
    res.setHeader("Cache-Control", "no-store");
    sendJson(res, 200, { overrides });
  } catch (error) {
    console.error("/api/question-overrides failed:", error);
    sendError(res, error);
  }
}
