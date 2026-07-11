const rawBaseUrl = process.env.HEALTHCHECK_BASE_URL?.trim();
if (!rawBaseUrl) throw new Error("HEALTHCHECK_BASE_URL is required.");
const baseUrl = new URL(rawBaseUrl.endsWith("/") ? rawBaseUrl : `${rawBaseUrl}/`);
const timeoutMs = Number(process.env.HEALTHCHECK_TIMEOUT_MS || 8 * 60_000);
const intervalMs = Number(process.env.HEALTHCHECK_INTERVAL_MS || 15_000);

function assertHeader(
  response: Response,
  name: string,
  pattern: RegExp,
  url: URL,
): void {
  const value = response.headers.get(name) || "";
  if (!pattern.test(value)) {
    throw new Error(`${url} returned unexpected ${name}: ${value || "<missing>"}`);
  }
}

async function check(
  pathname: string,
  expectedContentType?: RegExp,
): Promise<{ response: Response; url: URL }> {
  const url = new URL(pathname.replace(/^\/+/, ""), baseUrl);
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  if (expectedContentType) {
    assertHeader(response, "content-type", expectedContentType, url);
  }
  return { response, url };
}

async function runChecks(): Promise<void> {
  const { response: htmlResponse, url: htmlUrl } = await check(
    "/",
    /text\/html/i,
  );
  assertHeader(htmlResponse, "cache-control", /no-(?:cache|store)/i, htmlUrl);
  assertHeader(htmlResponse, "content-security-policy", /default-src\s+'self'/i, htmlUrl);
  assertHeader(htmlResponse, "x-content-type-options", /nosniff/i, htmlUrl);
  assertHeader(htmlResponse, "x-frame-options", /deny/i, htmlUrl);
  const html = await htmlResponse.text();
  if (!html.includes('id="root"')) {
    throw new Error("Production HTML does not contain the React root.");
  }

  const [{ response: swResponse, url: swUrl }] = await Promise.all([
    check("/sw.js", /javascript/i),
    check("/manifest.webmanifest", /json|manifest/i),
    check("/data/question-release-manifest.json", /json/i),
    check("/data/pdf-image-quiz-plan-index.json", /json/i),
    check("/data/pdf-image-quiz-trial.json", /json/i),
  ]);
  assertHeader(swResponse, "cache-control", /no-(?:cache|store)/i, swUrl);

  const assetMatch = html.match(
    /(?:src|href)="([^"]*\/assets\/[^"]+\.(?:js|css))"/i,
  );
  if (!assetMatch?.[1]) {
    throw new Error("No built JS/CSS asset was found in production HTML.");
  }
  const { response: assetResponse, url: assetUrl } = await check(
    assetMatch[1],
    /javascript|text\/css/i,
  );
  assertHeader(assetResponse, "cache-control", /immutable/i, assetUrl);

  const { response: manifestResponse } = await check(
    "/data/question-release-manifest.json",
    /json/i,
  );
  const manifest = (await manifestResponse.json()) as {
    schemaVersion?: number;
    releaseId?: string;
    totalQuestions?: number;
    banks?: Array<{ chapters?: Array<{ path?: string }> }>;
  };
  if (manifest.schemaVersion !== 2) {
    throw new Error(`Unexpected question manifest schema: ${manifest.schemaVersion}`);
  }
  if (!manifest.releaseId || (manifest.totalQuestions ?? 0) < 1) {
    throw new Error("Question release manifest is missing release metadata.");
  }
  const firstShard = manifest.banks
    ?.flatMap((bank) => bank.chapters || [])
    .find((chapter) => chapter.path)?.path;
  if (!firstShard) {
    throw new Error("Question release manifest contains no chapter shards.");
  }
  await check(`/${firstShard}`, /json/i);

  const rawEditorUrl = new URL("data/pdf-image-quiz.json", baseUrl);
  const rawEditorResponse = await fetch(rawEditorUrl, {
    headers: { "Cache-Control": "no-cache" },
  });
  if (
    rawEditorResponse.ok &&
    /application\/json/i.test(rawEditorResponse.headers.get("content-type") || "")
  ) {
    throw new Error("Raw editor question source is publicly deployed.");
  }
}

const startedAt = Date.now();
let attempt = 0;
let lastError: unknown = null;
while (Date.now() - startedAt <= timeoutMs) {
  attempt += 1;
  try {
    await runChecks();
    console.log(
      `Production health check passed after ${attempt} attempt(s): ${baseUrl.origin}`,
    );
    process.exitCode = 0;
    break;
  } catch (error) {
    lastError = error;
    const elapsed = Date.now() - startedAt;
    if (elapsed + intervalMs > timeoutMs) break;
    console.warn(
      `Production not ready (attempt ${attempt}): ${error instanceof Error ? error.message : String(error)}`,
    );
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

if (lastError && process.exitCode !== 0) {
  throw lastError;
}

export {};
