const rawBaseUrl = process.env.HEALTHCHECK_BASE_URL?.trim();
if (!rawBaseUrl) throw new Error("HEALTHCHECK_BASE_URL is required.");
const baseUrl = new URL(rawBaseUrl.endsWith("/") ? rawBaseUrl : `${rawBaseUrl}/`);

async function check(pathname: string, expectedContentType?: RegExp): Promise<Response> {
  const url = new URL(pathname.replace(/^\/+/, ""), baseUrl);
  const response = await fetch(url, { redirect: "follow", headers: { "Cache-Control": "no-cache" } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  if (expectedContentType && !expectedContentType.test(response.headers.get("content-type") || "")) {
    throw new Error(`${url} returned unexpected content-type: ${response.headers.get("content-type")}`);
  }
  return response;
}

const htmlResponse = await check("/", /text\/html/i);
const html = await htmlResponse.text();
if (!html.includes('id="root"')) throw new Error("Production HTML does not contain the React root.");

await Promise.all([
  check("/manifest.webmanifest", /json|manifest/i),
  check("/sw.js", /javascript/i),
  check("/data/question-release-manifest.json", /json/i),
  check("/data/pdf-image-quiz-plan-index.json", /json/i),
  check("/data/pdf-image-quiz-trial.json", /json/i),
]);

const assetMatch = html.match(/(?:src|href)="([^"]*\/assets\/[^"]+\.(?:js|css))"/i);
if (!assetMatch?.[1]) throw new Error("No built JS/CSS asset was found in production HTML.");
await check(assetMatch[1], /javascript|text\/css/i);

const manifestResponse = await check("/data/question-release-manifest.json", /json/i);
const manifest = await manifestResponse.json() as { banks?: Array<{ chapters?: Array<{ path?: string }> }> };
const firstShard = manifest.banks?.flatMap((bank) => bank.chapters || []).find((chapter) => chapter.path)?.path;
if (!firstShard) throw new Error("Question release manifest contains no chapter shards.");
await check(`/${firstShard}`, /json/i);

console.log(`Production health check passed: ${baseUrl.origin}`);

export {};
