import { createHash } from "node:crypto";
import type { QuestionOverride } from "./_questionOverrides.js";
import { getAdminClient, sendError, sendJson, sendPublicJson, type ApiRequest, type ApiResponse } from "./_adminClient.js";

const PAGE_SIZE = 500;

function isMissingReleaseTable(error: unknown): boolean {
  const message = typeof error === "object" && error !== null && "message" in error
    ? String((error as { message?: unknown }).message || "")
    : String(error || "");
  return message.includes("question_release_pointer") || message.includes("question_release_items") || message.includes("Could not find the table");
}

async function listPublishedOverrides(): Promise<{ overrides: QuestionOverride[]; releaseId: string | null }> {
  const supabase = getAdminClient();
  const { data: pointer, error: pointerError } = await supabase
    .from("question_release_pointer")
    .select("active_release_id")
    .eq("singleton", true)
    .maybeSingle();
  if (pointerError) {
    if (isMissingReleaseTable(pointerError)) return { overrides: [], releaseId: null };
    throw pointerError;
  }
  if (!pointer?.active_release_id) return { overrides: [], releaseId: null };

  const overrides: QuestionOverride[] = [];
  let offset = 0;
  while (true) {
    const { data: rows, error } = await supabase
      .from("question_release_items")
      .select("payload")
      .eq("release_id", pointer.active_release_id)
      .order("question_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      if (isMissingReleaseTable(error)) return { overrides: [], releaseId: null };
      throw error;
    }
    const page = rows || [];
    overrides.push(...page.map((row) => row.payload as QuestionOverride));
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return { overrides, releaseId: pointer.active_release_id };
}

function requestHeader(req: ApiRequest, name: string): string {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const published = await listPublishedOverrides();
    const payload = {
      overrides: published.overrides,
      releaseId: published.releaseId,
      releaseMode: published.releaseId ? "published" : "bundled-stable",
    };
    const etag = `"${createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24)}"`;
    if (requestHeader(req, "if-none-match") === etag) {
      res.statusCode = 304;
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=86400");
      res.setHeader("ETag", etag);
      res.end();
      return;
    }
    sendPublicJson(res, 200, payload, { etag });
  } catch (error) {
    console.error("/api/question-overrides failed:", error);
    sendError(res, error);
  }
}
