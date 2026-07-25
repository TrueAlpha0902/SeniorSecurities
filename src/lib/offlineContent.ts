import {
  cacheSecuritiesChapterForOffline,
  loadQuestionReleaseManifest,
  type QuestionReleaseManifest,
} from "./imageQuiz";

const DATA_CACHE = "question-bank-data";
const LEGACY_ASSET_CACHE = "question-bank-assets";
const INVENTORY_PREFIX = "quizpwa:offline-package:v3:";

type OfflinePackageInventory = {
  releaseId: string;
  bankId: string;
  dataUrls: string[];
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

function readInventory(releaseId: string, bankId: string): OfflinePackageInventory | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(inventoryKey(releaseId, bankId)) || "null",
    ) as OfflinePackageInventory | null;
    if (!parsed || parsed.releaseId !== releaseId || parsed.bankId !== bankId) return null;
    if (!Array.isArray(parsed.dataUrls)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeInventory(inventory: OfflinePackageInventory): void {
  localStorage.setItem(inventoryKey(inventory.releaseId, inventory.bankId), JSON.stringify(inventory));
}

async function cacheHasEvery(cache: Cache, urls: string[]): Promise<boolean> {
  for (const url of urls) {
    if (!(await cache.match(url))) return false;
  }
  return true;
}

async function inventoryIsComplete(inventory: OfflinePackageInventory): Promise<boolean> {
  if (!("caches" in window)) return false;
  const dataCache = await caches.open(DATA_CACHE);
  return cacheHasEvery(dataCache, inventory.dataUrls);
}

function removeObsoleteInventoryKeys(releaseId: string): void {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    if (key.startsWith("quizpwa:offline-package:v2:")) keys.push(key);
    if (key.startsWith(INVENTORY_PREFIX) && !key.startsWith(`${INVENTORY_PREFIX}${releaseId}:`)) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
}

export async function listOfflinePackages(): Promise<OfflinePackageSummary[]> {
  const manifest = await loadQuestionReleaseManifest();
  removeObsoleteInventoryKeys(manifest.releaseId);
  return Promise.all(manifest.banks.map(async (bank) => {
    const inventory = readInventory(manifest.releaseId, bank.bankId);
    const downloaded = inventory ? await inventoryIsComplete(inventory) : false;
    if (inventory && !downloaded) localStorage.removeItem(inventoryKey(manifest.releaseId, bank.bankId));
    return {
      bankId: bank.bankId,
      bankTitle: bank.bankTitle,
      questionCount: bank.questionCount,
      chapterCount: bank.chapters.length,
      downloaded,
    };
  }));
}

function bankChapters(manifest: QuestionReleaseManifest, bankId: string) {
  const bank = manifest.banks.find((candidate) => candidate.bankId === bankId);
  if (!bank) throw new Error(`找不到離線科目：${bankId}`);
  return bank.chapters;
}

export async function downloadOfflineBank(
  bankId: string,
  onProgress?: (progress: OfflineDownloadProgress) => void,
): Promise<void> {
  if (!("caches" in window)) throw new Error("此瀏覽器不支援離線快取。");
  const manifest = await loadQuestionReleaseManifest();
  const chapters = bankChapters(manifest, bankId);
  const urls: string[] = [];
  let completed = 0;
  for (const chapter of chapters) {
    urls.push(await cacheSecuritiesChapterForOffline(chapter.path, chapter.hash));
    completed += 1;
    onProgress?.({
      completed,
      total: chapters.length,
      label: `下載文字章節 ${completed}/${chapters.length}`,
    });
  }
  const inventory: OfflinePackageInventory = {
    releaseId: manifest.releaseId,
    bankId,
    dataUrls: urls,
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
  const dataCache = await caches.open(DATA_CACHE);
  await Promise.all(inventory.dataUrls.map((url) => dataCache.delete(url)));
  localStorage.removeItem(inventoryKey(manifest.releaseId, bankId));
}

export async function clearAllOfflineContent(): Promise<void> {
  if ("caches" in window) {
    await Promise.all([caches.delete(DATA_CACHE), caches.delete(LEGACY_ASSET_CACHE)]);
  }
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("quizpwa:offline-package:")) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
}
