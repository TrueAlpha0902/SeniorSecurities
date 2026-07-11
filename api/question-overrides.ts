import { listQuestionOverrides, type QuestionOverride } from "./_questionOverrides.js";
import { getAdminClient, sendError, sendJson, type ApiRequest, type ApiResponse } from "./_adminClient.js";

function isMissingReleaseTable(error: unknown): boolean {
  const message = typeof error === "object" && error !== null && "message" in error
    ? String((error as { message?: unknown }).message || "")
    : String(error || "");
  return message.includes("question_release_pointer") || message.includes("question_release_items") || message.includes("Could not find the table");
}

async function listPublishedOverrides(): Promise<QuestionOverride[] | null> {
  const supabase = getAdminClient();
  const { data: pointer, error: pointerError } = await supabase
    .from("question_release_pointer")
    .select("active_release_id")
    .eq("singleton", true)
    .maybeSingle();
  if (pointerError) {
    if (isMissingReleaseTable(pointerError)) return null;
    throw pointerError;
  }
  if (!pointer?.active_release_id) return null;

  const { data: rows, error } = await supabase
    .from("question_release_items")
    .select("payload")
    .eq("release_id", pointer.active_release_id)
    .order("question_id", { ascending: true });
  if (error) {
    if (isMissingReleaseTable(error)) return null;
    throw error;
  }
  return (rows || []).map((row) => row.payload as QuestionOverride);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const published = await listPublishedOverrides();
    const overrides = published ?? await listQuestionOverrides(getAdminClient());
    res.setHeader("Cache-Control", "no-store");
    sendJson(res, 200, {
      overrides,
      releaseMode: published ? "published" : "legacy-draft-fallback",
    });
  } catch (error) {
    console.error("/api/question-overrides failed:", error);
    sendError(res, error);
  }
}
