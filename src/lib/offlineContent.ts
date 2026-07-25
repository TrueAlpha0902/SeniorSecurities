import {
  assetUrl,
  loadQuestionReleaseManifest,
  type ImageQuizQuestion,
  type QuestionReleaseManifest,
} from "./imageQuiz";

const DATA_CACHE = "question-bank-data";
const ASSET_CACHE = "question-bank-assets";
const INVENTORY_PREFIX = "quizpwa:offline-package:v2:";

type ShardPayload = { chapter: { questions: ImageQuizQuestion[] } };

type OfflinePackageInventory = {
  releaseId: string;
  bankId: string;
  dataUrls: string[];
  assetUrls: string[];
  completedAt: string;
};

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

function inventoryKey(releaseId: string, bankId: string): string {
  return `${INVENTORY_PREFIX}${releaseId}:${bankId}`;
}

function versionedUrl(path: string, version: string): string {
  const url = assetUrl(path);
  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
}

function readInventory(
  releaseId: string,
  bankId: string,
): OfflinePackageInventory | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(inventoryKey(releaseId, bankId)) || "null",
    ) as OfflinePackageInventory | null;
    if (!parsed || parsed.releaseId !== releaseId || parsed.bankId !== bankId)
      return null;
    if (!Array.isArray(parsed.dataUrls) || !Array.isArray(parsed.assetUrls))
      return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeInventory(inventory: OfflinePackageInventory): void {
  localStorage.setItem(
    inventoryKey(inventory.releaseId, inventory.bankId),
    JSON.stringify(inventory),
  );
}

async function cacheHasEvery(cache: Cache, urls: string[]): Promise<boolean> {
  for (const url of urls) {
    if (!(await cache.match(url))) return false;
  }
  return true;
}

async function inventoryIsComplete(
  inventory: OfflinePackageInventory,
): Promise<boolean> {
  if (!("caches" in window)) return false;
  const [dataCache, assetCache] = await Promise.all([
    caches.open(DATA_CACHE),
    caches.open(ASSET_CACHE),
  ]);
  return (
    (await cacheHasEvery(dataCache, inventory.dataUrls)) &&
    (await cacheHasEvery(assetCache, inventory.assetUrls))
  );
}

async function cacheResponse(
  url: string,
  cacheName: string,
): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(url);
  if (cached) return cached;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下載失敗：${response.status} ${url}`);
  await cache.put(url, response.clone());
  return response;
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const current = items[cursor];
        cursor += 1;
        if (current !== undefined) await task(current);
      }
    },
  );
  await Promise.all(workers);
}

function allInventoriesForRelease(
  manifest: QuestionReleaseManifest,
): OfflinePackageInventory[] {
  return manifest.banks
    .map((bank) => readInventory(manifest.releaseId, bank.bankId))
    .filter((inventory): inventory is OfflinePackageInventory =>
      Boolean(inventory),
    );
}

function removeObsoleteInventoryKeys(releaseId: string): void {
  const prefix = INVENTORY_PREFIX;
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(prefix) && !key.startsWith(`${prefix}${releaseId}:`))
      keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
}

export async function listOfflinePackages(): Promise<OfflinePackageSummary[]> {
  const manifest = await loadQuestionReleaseManifest();
  removeObsoleteInventoryKeys(manifest.releaseId);
  return Promise.all(
    manifest.banks.map(async (bank) => {
      const inventory = readInventory(manifest.releaseId, bank.bankId);
      const downloaded = inventory
        ? await inventoryIsComplete(inventory)
        : false;
      if (inventory && !downloaded)
        localStorage.removeItem(inventoryKey(manifest.releaseId, bank.bankId));
      return {
        bankId: bank.bankId,
        bankTitle: bank.bankTitle,
        questionCount: bank.questionCount,
        chapterCount: bank.chapters.length,
        downloaded,
      };
    }),
  );
}

async function loadBankShardPayloads(
  manifest: QuestionReleaseManifest,
  bankId: string,
  onProgress?: (progress: OfflineDownloadProgress) => void,
): Promise<Array<{ url: string; payload: ShardPayload }>> {
  const bank = manifest.banks.find((candidate) => candidate.bankId === bankId);
  if (!bank) throw new Error(`找不到離線科目：${bankId}`);
  const result: Array<{ url: string; payload: ShardPayload }> = [];
  let completed = 0;
  for (const chapter of bank.chapters) {
    const url = versionedUrl(chapter.path, chapter.hash);
    const response = await cacheResponse(url, DATA_CACHE);
    result.push({ url, payload: (await response.json()) as ShardPayload });
    completed += 1;
    onProgress?.({
      completed,
      total: bank.chapters.length,
      label: `下載章節 ${completed}/${bank.chapters.length}`,
    });
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
  const assetUrls = Array.from(
    new Set(
      shards.flatMap(({ payload }) =>
        payload.chapter.questions.flatMap((question) => [
          ...question.questionSegments.map((segment) =>
            versionedUrl(segment.src, manifest.releaseId),
          ),
          ...question.explanationSegments.map((segment) =>
            versionedUrl(segment.src, manifest.releaseId),
          ),
          ...(question.mobileQuestionSegments || []).map((segment) =>
            versionedUrl(segment.src, manifest.releaseId),
          ),
          ...(question.mobileExplanationSegments || []).map((segment) =>
            versionedUrl(segment.src, manifest.releaseId),
          ),
        ]),
      ),
    ),
  );
  let completed = 0;
  await runPool(assetUrls, 4, async (url) => {
    await cacheResponse(url, ASSET_CACHE);
    completed += 1;
    onProgress?.({
      completed,
      total: assetUrls.length,
      label: `下載題目圖片 ${completed}/${assetUrls.length}`,
    });
  });
  const inventory: OfflinePackageInventory = {
    releaseId: manifest.releaseId,
    bankId,
    dataUrls: shards.map(({ url }) => url),
    assetUrls,
    completedAt: new Date().toISOString(),
  };
  writeInventory(inventory);
  if (!(await inventoryIsComplete(inventory))) {
    localStorage.removeItem(inventoryKey(manifest.releaseId, bankId));
    throw new Error("離線內容驗證失敗，請重新下載。");
  }
}

export async function clearOfflineBank(bankId: string): Promise<void> {
  if (!("caches" in window)) return;
  const manifest = await loadQuestionReleaseManifest();
  const inventory = readInventory(manifest.releaseId, bankId);
  if (!inventory) return;
  const [dataCache, assetCache] = await Promise.all([
    caches.open(DATA_CACHE),
    caches.open(ASSET_CACHE),
  ]);
  const otherAssetUrls = new Set(
    allInventoriesForRelease(manifest)
      .filter((item) => item.bankId !== bankId)
      .flatMap((item) => item.assetUrls),
  );
  await Promise.all(inventory.dataUrls.map((url) => dataCache.delete(url)));
  await Promise.all(
    inventory.assetUrls
      .filter((url) => !otherAssetUrls.has(url))
      .map((url) => assetCache.delete(url)),
  );
  localStorage.removeItem(inventoryKey(manifest.releaseId, bankId));
}

export async function clearAllOfflineContent(): Promise<void> {
  if ("caches" in window)
    await Promise.all([caches.delete(DATA_CACHE), caches.delete(ASSET_CACHE)]);
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(INVENTORY_PREFIX)) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
}
