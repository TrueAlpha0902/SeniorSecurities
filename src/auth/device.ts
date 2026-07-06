const DEVICE_ID_KEY = "senior-securities-device-id";
const DEVICE_FINGERPRINT_VERSION = "stable-v2";

function normalizeDevicePart(value: string | number | undefined | null): string {
  return String(value ?? "unknown")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 180);
}

function stableScreenSize(): string {
  const width = window.screen?.width ?? 0;
  const height = window.screen?.height ?? 0;
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  return `${shortSide}x${longSide}`;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

export function getDeviceSignature(): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown-timezone";
  const parts = [
    normalizeDevicePart(navigator.userAgent),
    normalizeDevicePart(navigator.platform),
    normalizeDevicePart(navigator.language),
    normalizeDevicePart(timezone),
    normalizeDevicePart(stableScreenSize()),
    normalizeDevicePart(window.screen?.colorDepth ?? 0),
    normalizeDevicePart(navigator.maxTouchPoints ?? 0),
  ];
  return parts.join(" | ").slice(0, 900);
}

export function getOrCreateDeviceFingerprint(): string {
  const signature = getDeviceSignature();
  const stableFingerprint = `${DEVICE_FINGERPRINT_VERSION}-${hashString(signature)}`;
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);

  if (existing !== stableFingerprint) {
    window.localStorage.setItem(DEVICE_ID_KEY, stableFingerprint);
  }

  return stableFingerprint;
}

export function getDeviceLabel(): string {
  const userAgent = navigator.userAgent || "";
  const isIPhone = /iPhone/i.test(userAgent);
  const isIPad = /iPad/i.test(userAgent) || (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(userAgent);
  const isMac = /Mac/i.test(navigator.platform || "");
  const isWindows = /Win/i.test(navigator.platform || "");
  const deviceName = isIPhone ? "iPhone" : isIPad ? "iPad" : isAndroid ? "Android" : isMac ? "Mac" : isWindows ? "Windows" : navigator.platform || "Unknown";
  const language = navigator.language || "unknown-language";
  return `${deviceName} / ${language} / ${stableScreenSize()}`.slice(0, 160);
}
