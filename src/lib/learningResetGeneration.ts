import { clearLearningStoreCache } from "./learningStateStore";
import {
  getReliabilityMetadata,
  resetReliabilityLearningDomain,
} from "./reliabilityStore";
import { supabase } from "./supabase";

export type LearningResetExamId =
  | "senior-securities"
  | "junior-foreign-exchange";
export type LearningResetMode = "wrong" | "restart" | "complete";
export const LEARNING_RESET_APPLIED_EVENT = "learning-reset:applied-v96";

const dataGenerationCache = new Map<string, number>();
const wrongGenerationCache = new Map<string, number>();
const remoteCheckedScopes = new Set<string>();

export type LearningResetGenerationSync = {
  examId: LearningResetExamId;
  generation: number;
  wrongGeneration: number;
  mode: LearningResetMode | null;
  dataMode: Exclude<LearningResetMode, "wrong"> | null;
  changed: boolean;
  dataChanged: boolean;
  wrongChanged: boolean;
};

function scopeKey(userId: string, examId: LearningResetExamId): string {
  return `${userId}:${examId}`;
}

function dataMetadataKey(examId: LearningResetExamId): string {
  return `${examId}-reset-generation-v96`;
}

function wrongMetadataKey(examId: LearningResetExamId): string {
  return `${examId}-wrong-reset-generation-v96`;
}

function normalizeGeneration(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}

function normalizeMode(value: unknown): LearningResetMode | null {
  return value === "wrong" || value === "restart" || value === "complete"
    ? value
    : null;
}

function looksLikeForeignExchange(value: unknown): boolean {
  return typeof value === "string" && (
    /^fx-(?:2[3-9]|3\d|4[0-7])-(?:remittance|trade)-\d{3}$/.test(value) ||
    value.startsWith("fx-") ||
    value.startsWith("foreign-exchange") ||
    value.startsWith("junior-foreign-exchange")
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

export function inferLearningResetExamId(
  value: unknown,
): LearningResetExamId {
  const payload = asRecord(value);
  if (payload.examId === "junior-foreign-exchange") {
    return "junior-foreign-exchange";
  }
  if (payload.examId === "senior-securities") return "senior-securities";
  const record = asRecord(payload.record);
  const attempt = asRecord(payload.attempt);
  const state = asRecord(payload.state);
  const values = Array.isArray(payload.values) ? payload.values : [];
  const candidates = [
    payload.questionId,
    payload.scopeId,
    payload.bankId,
    record.questionId,
    record.bankId,
    record.scopeId,
    attempt.questionId,
    state.questionId,
    ...values,
  ];
  return candidates.some(looksLikeForeignExchange)
    ? "junior-foreign-exchange"
    : "senior-securities";
}

export function isLearningMutationForExam(
  payload: unknown,
  examId: LearningResetExamId,
): boolean {
  return inferLearningResetExamId(payload) === examId;
}

export function isWrongResetMutation(payload: unknown): boolean {
  const mutation = asRecord(payload);
  return mutation.kind === "upsert-wrong" ||
    mutation.kind === "delete-wrong" ||
    ((mutation.kind === "delete-many" || mutation.kind === "clear-table") &&
      mutation.table === "user_wrong_records");
}

function isFavoriteMutation(payload: unknown): boolean {
  const mutation = asRecord(payload);
  return mutation.kind === "upsert-favorite" ||
    mutation.kind === "delete-favorite" ||
    ((mutation.kind === "delete-many" || mutation.kind === "clear-table") &&
      mutation.table === "user_favorite_records");
}

function rebaseMutationGeneration(payload: unknown, generation: number): unknown {
  const mutation = asRecord(payload);
  if (!Object.keys(mutation).length) return payload;
  const next: Record<string, unknown> = {
    ...mutation,
    resetGeneration: generation,
  };
  if (mutation.kind === "sync-learning-attempt") {
    next.attempt = { ...asRecord(mutation.attempt), resetGeneration: generation };
  }
  return next;
}

function isMissingRpc(
  error: { code?: string; message?: string },
  functionName: string,
): boolean {
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    String(error.message || "").includes(functionName)
  );
}

async function localDataGeneration(
  userId: string,
  examId: LearningResetExamId,
): Promise<number> {
  const key = scopeKey(userId, examId);
  const cached = dataGenerationCache.get(key);
  if (cached != null) return cached;
  const persisted = normalizeGeneration(
    await getReliabilityMetadata<number>(userId, dataMetadataKey(examId)),
  );
  dataGenerationCache.set(key, persisted);
  return persisted;
}

async function localWrongGeneration(
  userId: string,
  examId: LearningResetExamId,
): Promise<number> {
  const key = scopeKey(userId, examId);
  const cached = wrongGenerationCache.get(key);
  if (cached != null) return cached;
  const persisted = normalizeGeneration(
    await getReliabilityMetadata<number>(userId, wrongMetadataKey(examId)),
  );
  wrongGenerationCache.set(key, persisted);
  return persisted;
}

export function peekLearningResetGeneration(
  userId: string,
  examId: LearningResetExamId,
): number {
  return dataGenerationCache.get(scopeKey(userId, examId)) ?? 0;
}

export function peekLearningWrongResetGeneration(
  userId: string,
  examId: LearningResetExamId,
): number {
  return wrongGenerationCache.get(scopeKey(userId, examId)) ?? 0;
}

export async function applyLearningResetGeneration(
  userId: string,
  examId: LearningResetExamId,
  generation: number,
  mode: LearningResetMode | null = "restart",
  wrongGeneration: number = generation,
  dataMode: Exclude<LearningResetMode, "wrong"> | null = mode === "complete"
    ? "complete"
    : mode === "restart"
      ? "restart"
      : null,
): Promise<LearningResetGenerationSync> {
  const normalized = normalizeGeneration(generation);
  const normalizedWrong = normalizeGeneration(wrongGeneration);
  const [previous, previousWrong] = await Promise.all([
    localDataGeneration(userId, examId),
    localWrongGeneration(userId, examId),
  ]);
  if (normalized < previous || normalizedWrong < previousWrong) {
    throw new Error("伺服器回傳較舊的重設版本，已停止同步以保護本機資料。");
  }
  const dataChanged = previous !== normalized;
  const wrongChanged = previousWrong !== normalizedWrong;
  if (!dataChanged && !wrongChanged) {
    return {
      examId,
      generation: normalized,
      wrongGeneration: normalizedWrong,
      mode,
      dataMode,
      changed: false,
      dataChanged: false,
      wrongChanged: false,
    };
  }

  await resetReliabilityLearningDomain<unknown>(
    userId,
    [
      { key: dataMetadataKey(examId), value: normalized },
      { key: wrongMetadataKey(examId), value: normalizedWrong },
    ],
    (payload) => {
      if (!isLearningMutationForExam(payload, examId)) return payload;
      if (!dataChanged) return isWrongResetMutation(payload) ? null : payload;
      if (mode === "restart" && isFavoriteMutation(payload)) {
        return rebaseMutationGeneration(payload, normalized);
      }
      return null;
    },
    examId === "senior-securities" && dataChanged,
  );
  dataGenerationCache.set(scopeKey(userId, examId), normalized);
  wrongGenerationCache.set(scopeKey(userId, examId), normalizedWrong);
  remoteCheckedScopes.add(scopeKey(userId, examId));
  if (examId === "senior-securities" && dataChanged) {
    clearLearningStoreCache(userId);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LEARNING_RESET_APPLIED_EVENT, {
      detail: { examId, mode, dataChanged, wrongChanged },
    }));
  }
  return {
    examId,
    generation: normalized,
    wrongGeneration: normalizedWrong,
    mode,
    dataMode,
    changed: true,
    dataChanged,
    wrongChanged,
  };
}

export async function synchronizeLearningResetGeneration(
  userId: string,
  examId: LearningResetExamId = "senior-securities",
  forceRemote = false,
): Promise<LearningResetGenerationSync> {
  const key = scopeKey(userId, examId);
  const [local, localWrong] = await Promise.all([
    localDataGeneration(userId, examId),
    localWrongGeneration(userId, examId),
  ]);
  if (!forceRemote && remoteCheckedScopes.has(key)) {
    return {
      examId,
      generation: local,
      wrongGeneration: localWrong,
      mode: null,
      dataMode: null,
      changed: false,
      dataChanged: false,
      wrongChanged: false,
    };
  }
  if (!supabase || userId === "local-preview-user") {
    remoteCheckedScopes.add(key);
    return {
      examId,
      generation: local,
      wrongGeneration: localWrong,
      mode: null,
      dataMode: null,
      changed: false,
      dataChanged: false,
      wrongChanged: false,
    };
  }

  const stateResult = await supabase.rpc("get_learning_reset_state_v96", {
    p_exam_id: examId,
  });
  if (!stateResult.error) {
    const row = Array.isArray(stateResult.data)
      ? stateResult.data[0]
      : stateResult.data;
    const state = row && typeof row === "object"
      ? row as Record<string, unknown>
      : {};
    remoteCheckedScopes.add(key);
    const nextDataGeneration = normalizeGeneration(
      state.dataGeneration ?? state.generation,
    );
    const nextWrongGeneration = normalizeGeneration(
      state.wrongGeneration ?? nextDataGeneration,
    );
    const normalizedDataMode = normalizeMode(state.dataMode);
    const dataMode = normalizedDataMode === "complete"
      ? "complete"
      : normalizedDataMode === "restart"
        ? "restart"
        : null;
    const mode = nextDataGeneration > local
      ? (dataMode ?? "restart")
      : nextWrongGeneration > localWrong
        ? "wrong"
        : normalizeMode(state.mode);
    return applyLearningResetGeneration(
      userId,
      examId,
      nextDataGeneration,
      mode,
      nextWrongGeneration,
      dataMode,
    );
  }
  if (!isMissingRpc(stateResult.error, "get_learning_reset_state_v96")) {
    throw stateResult.error;
  }

  const legacyResult = await supabase.rpc(
    "get_learning_reset_generation_v96",
    { p_exam_id: examId },
  );
  if (legacyResult.error) {
    if (isMissingRpc(legacyResult.error, "get_learning_reset_generation_v96")) {
      remoteCheckedScopes.add(key);
      return {
        examId,
        generation: local,
        wrongGeneration: localWrong,
        mode: null,
        dataMode: null,
        changed: false,
        dataChanged: false,
        wrongChanged: false,
      };
    }
    throw legacyResult.error;
  }
  remoteCheckedScopes.add(key);
  return applyLearningResetGeneration(
    userId,
    examId,
    normalizeGeneration(legacyResult.data),
    "restart",
  );
}

export async function getLearningResetGeneration(
  userId: string,
  examId: LearningResetExamId = "senior-securities",
): Promise<number> {
  return (await synchronizeLearningResetGeneration(userId, examId)).generation;
}

export async function getLearningWrongResetGeneration(
  userId: string,
  examId: LearningResetExamId = "senior-securities",
): Promise<number> {
  return (await synchronizeLearningResetGeneration(userId, examId)).wrongGeneration;
}

export function clearLearningResetGenerationCache(userId: string): void {
  for (const examId of ["senior-securities", "junior-foreign-exchange"] as const) {
    dataGenerationCache.delete(scopeKey(userId, examId));
    wrongGenerationCache.delete(scopeKey(userId, examId));
    remoteCheckedScopes.delete(scopeKey(userId, examId));
  }
}

export function isStaleLearningGenerationError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message || "")
        : String(error || "");
  return message.includes("stale learning generation");
}
