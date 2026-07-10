import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET_NAME = "question-editor-overrides";
const CACHE_TTL_MS = 0;

export type QuestionOverrideSegment = {
  page: number;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
};

export type QuestionOverride = {
  questionId: string;
  answer: "1" | "2" | "3" | "4";
  questionSegments: QuestionOverrideSegment[];
  explanationSegments: QuestionOverrideSegment[];
  updatedAt: string;
  updatedBy: string;
};

let overrideCache: { expiresAt: number; value: QuestionOverride[] } | undefined;

function isMissingBucketError(error: unknown): boolean {
  const message = typeof error === "object" && error !== null && "message" in error
    ? String((error as { message?: unknown }).message || "")
    : String(error || "");
  return /bucket.*not found|not found/i.test(message);
}

export async function ensureQuestionOverrideBucket(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase.storage.getBucket(BUCKET_NAME);
  if (data) return;
  if (error && !isMissingBucketError(error)) throw error;

  const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
    public: false,
    fileSizeLimit: 256 * 1024,
    allowedMimeTypes: ["application/json"],
  });
  if (createError && !/already exists|duplicate/i.test(String(createError.message || ""))) throw createError;
}

async function bucketExists(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.storage.getBucket(BUCKET_NAME);
  if (data) return true;
  if (error && isMissingBucketError(error)) return false;
  if (error) throw error;
  return false;
}

export async function listQuestionOverrides(
  supabase: SupabaseClient,
  options: { bypassCache?: boolean } = {},
): Promise<QuestionOverride[]> {
  if (!options.bypassCache && overrideCache && overrideCache.expiresAt > Date.now()) {
    return overrideCache.value;
  }
  if (!(await bucketExists(supabase))) return [];

  const fileNames: string[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET_NAME).list("", {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    const names = (data || []).map((file) => file.name).filter((name) => name.endsWith(".json"));
    fileNames.push(...names);
    if ((data || []).length < limit) break;
    offset += limit;
  }

  const overrides: QuestionOverride[] = [];
  for (let index = 0; index < fileNames.length; index += 20) {
    const batch = fileNames.slice(index, index + 20);
    const values = await Promise.all(batch.map(async (name) => {
      const { data, error } = await supabase.storage.from(BUCKET_NAME).download(name);
      if (error) throw error;
      return JSON.parse(await data.text()) as QuestionOverride;
    }));
    overrides.push(...values);
  }

  overrideCache = { expiresAt: Date.now() + CACHE_TTL_MS, value: overrides };
  return overrides;
}

export async function saveQuestionOverride(supabase: SupabaseClient, value: QuestionOverride): Promise<void> {
  await ensureQuestionOverrideBucket(supabase);
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const { error } = await supabase.storage.from(BUCKET_NAME).upload(`${value.questionId}.json`, bytes, {
    upsert: true,
    contentType: "application/json",
    cacheControl: "0",
  });
  if (error) throw error;
  overrideCache = undefined;
}

export async function deleteQuestionOverride(supabase: SupabaseClient, questionId: string): Promise<void> {
  if (!(await bucketExists(supabase))) return;
  const { error } = await supabase.storage.from(BUCKET_NAME).remove([`${questionId}.json`]);
  if (error) throw error;
  overrideCache = undefined;
}
