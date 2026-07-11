import {
  assetUrl,
  loadQuestionReleaseManifest,
  type ImageQuizQuestion,
  type QuestionReleaseManifest,
} from "./imageQuiz";

const DATA_CACHE = "question-bank-data";
const ASSET_CACHE = "question-bank-assets";
const STATUS_PREFIX = "quizpwa:offline-package:";

type ShardPayload = { chapter: { questions: ImageQuizQuestion[] } };

export type OfflinePackageSummary = {
  bankId: string;
  bankTitle: string;
  questionCount: number;
  chapterCount: number;
  downloaded: boolean;
};

export type OfflineDownloadProgress = {
  completed: number;
  total: number;
  label: string;
};

function statusKey(releaseId: string, bankId: string): string {
  return `${STATUS_PREFIX}${releaseId}:${bankId}`;
}

function versionedUrl(path: string, version: string): string {
  const url = assetUrl(path);
  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
}

async function cacheResponse(url: string, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(url);
  if (cached) return cached;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下載失敗：${response.status} ${url}`);
  await cache.put(url, response.clone());
  return response;
}

async function runPool<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const current = items[cursor];
      cursor += 1;
      if (current !== undefined) await task(current);
    }
  });
  await Promise.all(workers);
}

export async function listOfflinePackages(): Promise<OfflinePackageSummary[]> {
  const manifest = await loadQuestionReleaseManifest();
  return manifest.banks.map((bank) => ({
    bankId: bank.bankId,
    bankTitle: bank.bankTitle,
    questionCount: bank.questionCount,
    chapterCount: bank.chapters.length,
    downloaded: localStorage.getItem(statusKey(manifest.releaseId, bank.bankId)) === "ready",
  }));
}

async function loadBankShardPayloads(
  manifest: QuestionReleaseManifest,
  bankId: string,
  onProgress?: (progress: OfflineDownloadProgress) => void,
): Promise<Array<{ path: string; url: string; payload: ShardPayload }>> {
  const bank = manifest.banks.find((candidate) => candidate.bankId === bankId);
  if (!bank) throw new Error(`找不到離線科目：${bankId}`);
  const result: Array<{ path: string; url: string; payload: ShardPayload }> = [];
  let completed = 0;
  for (const chapter of bank.chapters) {
    const url = versionedUrl(chapter.path, chapter.hash);
    const response = await cacheResponse(url, DATA_CACHE);
    result.push({ path: chapter.path, url, payload: await response.json() as ShardPayload });
    completed += 1;
    onProgress?.({ completed, total: bank.chapters.length, label: `下載章節 ${completed}/${bank.chapters.length}` });
  }
  return result;
}

export async function downloadOfflineBank(
  bankId: string,
  onProgress?: (progress: OfflineDownloadProgress) => void,
): Promise<void> {
  if (!("caches" in window)) throw new Error("此瀏覽器不支援離線快取。");
  const manifest = await loadQuestionReleaseManifest();
  const bank = manifest.banks.find((candidate) => candidate.bankId === bankId);
  if (!bank) throw new Error(`找不到離線科目：${bankId}`);
  const shards = await loadBankShardPayloads(manifest, bankId, onProgress);
  const imageSources = Array.from(new Set(shards.flatMap(({ payload }) =>
    payload.chapter.questions.flatMap((question) => [
      ...question.questionSegments.map((segment) => segment.src),
      ...question.explanationSegments.map((segment) => segment.src),
    ]),
  )));
  let completed = 0;
  await runPool(imageSources, 4, async (source) => {
    await cacheResponse(versionedUrl(source, manifest.releaseId), ASSET_CACHE);
    completed += 1;
    onProgress?.({ completed, total: imageSources.length, label: `下載題目圖片 ${completed}/${imageSources.length}` });
  });
  localStorage.setItem(statusKey(manifest.releaseId, bankId), "ready");
}

export async function clearOfflineBank(bankId: string): Promise<void> {
  if (!("caches" in window)) return;
  const manifest = await loadQuestionReleaseManifest();
  const bank = manifest.banks.find((candidate) => candidate.bankId === bankId);
  if (!bank) return;
  const dataCache = await caches.open(DATA_CACHE);
  const assetCache = await caches.open(ASSET_CACHE);
  const imageSources = new Set<string>();
  for (const chapter of bank.chapters) {
    const url = versionedUrl(chapter.path, chapter.hash);
    const response = await dataCache.match(url) ?? await fetch(url).catch(() => null);
    if (response?.ok) {
      const payload = await response.clone().json() as ShardPayload;
      for (const question of payload.chapter.questions) {
        for (const segment of [...question.questionSegments, ...question.explanationSegments]) imageSources.add(segment.src);
      }
    }
    await dataCache.delete(url);
  }
  await Promise.all(Array.from(imageSources).map((source) => assetCache.delete(versionedUrl(source, manifest.releaseId))));
  localStorage.removeItem(statusKey(manifest.releaseId, bankId));
}

export async function clearAllOfflineContent(): Promise<void> {
  if (!("caches" in window)) return;
  await Promise.all([caches.delete(DATA_CACHE), caches.delete(ASSET_CACHE)]);
  const manifest = await loadQuestionReleaseManifest();
  for (const bank of manifest.banks) localStorage.removeItem(statusKey(manifest.releaseId, bank.bankId));
}
