import { createClient } from "@supabase/supabase-js";

const rawBaseUrl = process.env.HEALTHCHECK_BASE_URL?.trim();
if (!rawBaseUrl) throw new Error("HEALTHCHECK_BASE_URL is required.");
const baseUrl = new URL(rawBaseUrl.endsWith("/") ? rawBaseUrl : `${rawBaseUrl}/`);
const timeoutMs = Number(process.env.HEALTHCHECK_TIMEOUT_MS || 8 * 60_000);
const intervalMs = Number(process.env.HEALTHCHECK_INTERVAL_MS || 15_000);
const requireAuthenticatedQuestions =
  process.env.HEALTHCHECK_REQUIRE_AUTHENTICATED_QUESTIONS === "1";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertHeader(response: Response, name: string, pattern: RegExp, url: URL): void {
  const value = response.headers.get(name) || "";
  if (!pattern.test(value)) {
    throw new Error(`${url} returned unexpected ${name}: ${value || "<missing>"}`);
  }
}

async function fetchPath(
  pathname: string,
  init: RequestInit = {},
): Promise<{ response: Response; url: URL }> {
  const url = new URL(pathname.replace(/^\/+/, ""), baseUrl);
  const response = await fetch(url, {
    redirect: "follow",
    ...init,
    headers: {
      "Cache-Control": "no-cache",
      ...(init.headers || {}),
    },
  });
  return { response, url };
}

async function check(
  pathname: string,
  expectedContentType?: RegExp,
): Promise<{ response: Response; url: URL }> {
  const result = await fetchPath(pathname);
  if (!result.response.ok) {
    const text = (await result.response.text()).slice(0, 300);
    throw new Error(
      `${result.url} returned ${result.response.status}: ${text}`,
    );
  }
  if (expectedContentType) {
    assertHeader(result.response, "content-type", expectedContentType, result.url);
  }
  return result;
}

async function readJsonResponse<T>(
  pathname: string,
  init: RequestInit = {},
): Promise<T> {
  const { response, url } = await fetchPath(pathname, init);
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${text.slice(0, 300)}`);
  }
  if (!/application\/json/i.test(contentType)) {
    throw new Error(`${url} returned non-JSON content: ${contentType}`);
  }
  return JSON.parse(text) as T;
}

async function assertNotPublicJson(pathname: string): Promise<void> {
  const { response, url } = await fetchPath(pathname);
  const contentType = response.headers.get("content-type") || "";
  if (response.ok && /application\/json/i.test(contentType)) {
    throw new Error(`${url} unexpectedly exposes protected or legacy JSON.`);
  }
}

async function assertNotPublicBinary(pathname: string): Promise<void> {
  const { response, url } = await fetchPath(pathname);
  const contentType = response.headers.get("content-type") || "";
  if (response.ok && /image\/|application\/pdf/i.test(contentType)) {
    throw new Error(`${url} unexpectedly exposes source scan content.`);
  }
}

async function assertMissingAssetReturns404(): Promise<void> {
  const pathname = `/assets/__stale-chunk-${Date.now()}.js`;
  const { response, url } = await fetchPath(pathname);
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();
  if (response.status !== 404) {
    throw new Error(
      `${url} must return 404 for a missing hashed asset, got ${response.status}.`,
    );
  }

  // Vercel may serve a static 404.html document for missing assets. That is
  // correct as long as the HTTP status remains 404 and the body is not the
  // actual React SPA index document.
  if (/text\/html/i.test(contentType) && body.includes('id="root"')) {
    throw new Error(
      `${url} incorrectly returned the React SPA index for a missing asset.`,
    );
  }
}

async function assertUnauthorizedApi(pathname: string): Promise<void> {
  const { response, url } = await fetchPath(pathname);
  if (response.status !== 401 && response.status !== 403) {
    throw new Error(
      `${url} must reject an unauthenticated request, got ${response.status}.`,
    );
  }
  const contentType = response.headers.get("content-type") || "";
  if (!/application\/json/i.test(contentType)) {
    throw new Error(`${url} returned a non-JSON authorization error.`);
  }
  const payload = await response.json() as Record<string, unknown>;
  assert(
    !Array.isArray(payload.questions),
    `${url} leaked question data before authentication.`,
  );
  assert(
    !Array.isArray(payload.results),
    `${url} leaked search or grading data before authentication.`,
  );
}

type QuestionHealthPayload = {
  ok?: boolean;
  release?: string;
  auth?: {
    supabaseUrlConfigured?: boolean;
    serviceRoleConfigured?: boolean;
    publishableKeyConfigured?: boolean;
    questionAuthConfigured?: boolean;
    mockSigningSecretConfigured?: boolean;
  };
  securities?: {
    totalQuestions?: number;
    bankCount?: number;
    shardCount?: number;
    firstShardQuestionCount?: number;
  };
  foreignExchange?: {
    totalQuestions?: number;
    sessionRange?: number[];
  };
};

async function assertQuestionApiHealth(): Promise<void> {
  const payload = await readJsonResponse<QuestionHealthPayload>(
    "/api/questions?resource=health",
  );
  assert(payload.ok === true, "Question API health endpoint is not ready.");
  assert(
    payload.release === "v91.2.2-question-bank-reliability",
    `Unexpected question API release: ${payload.release || "<missing>"}`,
  );
  assert(
    payload.auth?.questionAuthConfigured === true,
    "Question API Supabase authentication is not configured.",
  );
  assert(
    payload.auth?.mockSigningSecretConfigured === true,
    "Mock-exam signing secret is not configured.",
  );
  assert(
    payload.securities?.totalQuestions === 3_526,
    `Bundled securities count is ${payload.securities?.totalQuestions}, expected 3526.`,
  );
  assert(
    payload.securities?.shardCount === 40,
    `Bundled securities shard count is ${payload.securities?.shardCount}, expected 40.`,
  );
  assert(
    Number(payload.securities?.firstShardQuestionCount || 0) > 0,
    "The first bundled securities shard could not be opened.",
  );
  assert(
    payload.foreignExchange?.totalQuestions === 3_250,
    `Bundled foreign-exchange count is ${payload.foreignExchange?.totalQuestions}, expected 3250.`,
  );
}

async function healthcheckAccessToken(): Promise<string | null> {
  const directToken = process.env.HEALTHCHECK_ACCESS_TOKEN?.trim();
  if (directToken) return directToken;

  const email = process.env.HEALTHCHECK_USER_EMAIL?.trim();
  const password = process.env.HEALTHCHECK_USER_PASSWORD || "";
  if (!email || !password) return null;

  const supabaseUrl = (
    process.env.HEALTHCHECK_SUPABASE_URL
    || process.env.SUPABASE_URL
    || process.env.VITE_SUPABASE_URL
    || ""
  ).trim();
  const publishableKey = (
    process.env.HEALTHCHECK_SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || ""
  ).trim();

  if (!supabaseUrl || !publishableKey) {
    throw new Error(
      "Authenticated health check credentials were provided, but Supabase URL or publishable key is missing.",
    );
  }

  const client = createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session?.access_token) {
    throw new Error(
      `Authenticated health-check sign-in failed: ${error?.message || "no access token"}`,
    );
  }
  return data.session.access_token;
}

type SecuritiesChapterPayload = {
  chapter?: {
    questions?: Array<{
      id?: string;
      questionText?: string;
      optionTexts?: Record<string, string>;
      answer?: string;
    }>;
  };
};

type MockStartPayload = {
  mockToken?: string;
  questions?: Array<{ id?: string }>;
};

type ForeignExchangeQuestionsPayload = {
  questions?: Array<{
    id?: string;
    question?: string;
    options?: Record<string, string>;
    answer?: string;
  }>;
};

async function assertAuthenticatedQuestionFlows(
  token: string,
  firstShardPath: string,
): Promise<void> {
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const chapter = await readJsonResponse<SecuritiesChapterPayload>(
    `/api/questions?resource=securities&action=chapter&path=${encodeURIComponent(firstShardPath)}`,
    { headers: authHeaders },
  );
  const securitiesQuestions = chapter.chapter?.questions || [];
  assert(
    securitiesQuestions.length > 0,
    "Authenticated securities chapter returned no questions.",
  );
  const firstSecuritiesQuestion = securitiesQuestions[0];
  assert(
    Boolean(
      firstSecuritiesQuestion?.id
      && firstSecuritiesQuestion.questionText
      && firstSecuritiesQuestion.optionTexts?.["1"]
      && firstSecuritiesQuestion.answer,
    ),
    "Authenticated securities chapter returned an incomplete question.",
  );

  const securitiesMock = await readJsonResponse<MockStartPayload>(
    "/api/questions",
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        resource: "securities",
        action: "mock-start",
        bankId: "investment",
        randomCount: 5,
        avoidIds: [],
      }),
    },
  );
  assert(
    Boolean(securitiesMock.mockToken && securitiesMock.questions?.length === 5),
    "Authenticated securities mock exam could not be created.",
  );

  const foreignExchange = await readJsonResponse<ForeignExchangeQuestionsPayload>(
    "/api/questions",
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        resource: "foreign-exchange",
        action: "questions",
        session: 47,
        subject: "remittance",
      }),
    },
  );
  const fxQuestions = foreignExchange.questions || [];
  assert(
    fxQuestions.length === 50,
    `Authenticated foreign-exchange session returned ${fxQuestions.length} questions, expected 50.`,
  );
  const firstFxQuestion = fxQuestions[0];
  assert(
    Boolean(
      firstFxQuestion?.id
      && firstFxQuestion.question
      && firstFxQuestion.options?.A
      && firstFxQuestion.answer,
    ),
    "Authenticated foreign-exchange endpoint returned an incomplete question.",
  );

  const fxMock = await readJsonResponse<MockStartPayload>(
    "/api/questions",
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        resource: "foreign-exchange",
        action: "mock-start",
        session: 47,
        subject: "remittance",
        randomCount: 5,
      }),
    },
  );
  assert(
    Boolean(fxMock.mockToken && fxMock.questions?.length === 5),
    "Authenticated foreign-exchange mock exam could not be created.",
  );
}

async function runChecks(): Promise<void> {
  const { response: htmlResponse, url: htmlUrl } = await check("/", /text\/html/i);
  assertHeader(htmlResponse, "cache-control", /no-(?:cache|store)/i, htmlUrl);
  assertHeader(
    htmlResponse,
    "content-security-policy",
    /default-src\s+'self'/i,
    htmlUrl,
  );
  assertHeader(htmlResponse, "x-content-type-options", /nosniff/i, htmlUrl);
  assertHeader(htmlResponse, "x-frame-options", /deny/i, htmlUrl);
  const html = await htmlResponse.text();
  assert(
    html.includes('id="root"'),
    "Production HTML does not contain the React root.",
  );

  const [swResult, , manifestResult, , trialResult] = await Promise.all([
    check("/sw.js", /javascript/i),
    check("/manifest.webmanifest", /json|manifest/i),
    check("/data/question-release-manifest.json", /json/i),
    check("/data/pdf-image-quiz-plan-index.json", /json/i),
    check("/data/pdf-image-quiz-trial.json", /json/i),
    assertQuestionApiHealth(),
  ]);
  assertHeader(
    swResult.response,
    "cache-control",
    /no-(?:cache|store)/i,
    swResult.url,
  );

  const assetMatch = html.match(
    /(?:src|href)="([^"]*\/assets\/[^"]+\.(?:js|css))"/i,
  );
  assert(assetMatch?.[1], "No built JS/CSS asset was found in production HTML.");
  const { response: assetResponse, url: assetUrl } = await check(
    assetMatch[1],
    /javascript|text\/css/i,
  );
  assertHeader(assetResponse, "cache-control", /immutable/i, assetUrl);

  const manifest = (await manifestResult.response.json()) as {
    schemaVersion?: number;
    releaseId?: string;
    totalQuestions?: number;
    questionIndex?: Record<string, string>;
    banks?: Array<{
      chapters?: Array<{ path?: string }>;
    }>;
  };
  assert(
    manifest.schemaVersion === 3,
    `Unexpected question manifest schema: ${manifest.schemaVersion}`,
  );
  assert(
    Boolean(manifest.releaseId),
    "Question release manifest is missing release metadata.",
  );
  assert(
    manifest.totalQuestions === 3_526,
    `Question release count is ${manifest.totalQuestions}, expected 3526.`,
  );
  assert(
    Object.keys(manifest.questionIndex || {}).length === 3_526,
    "Question index count is incomplete.",
  );
  const privateShardPaths = (manifest.banks || []).flatMap((bank) =>
    (bank.chapters || [])
      .map((chapter) => String(chapter.path || ""))
      .filter(Boolean),
  );
  assert(
    privateShardPaths.length === 40,
    `Manifest must reference 40 private shards, got ${privateShardPaths.length}.`,
  );

  const trialText = await trialResult.response.text();
  assert(
    !trialText.includes("pdf-pages/"),
    "Public trial references removed scan pages.",
  );
  assert(!trialText.includes(".pdf"), "Public trial exposes source PDF names.");
  const trial = JSON.parse(trialText) as {
    banks?: Array<{
      chapters?: Array<{ questions?: Array<Record<string, unknown>> }>;
    }>;
  };
  const trialQuestions = (trial.banks || []).flatMap((bank) =>
    (bank.chapters || []).flatMap((chapter) => chapter.questions || []),
  );
  assert(
    trialQuestions.length === 10,
    `Public trial count is ${trialQuestions.length}, expected 10.`,
  );
  for (const question of trialQuestions) {
    assert(
      typeof question.questionText === "string"
        && question.questionText.length > 0,
      "Trial question text is missing.",
    );
    assert(
      typeof question.explanationText === "string"
        && question.explanationText.length > 0,
      "Trial explanation is missing.",
    );
    assert(question.sourceFile === "", "Trial sourceFile must be blank.");
    assert(
      Array.isArray(question.questionSegments)
        && question.questionSegments.length === 0,
      "Trial question scan metadata leaked.",
    );
    assert(
      Array.isArray(question.explanationSegments)
        && question.explanationSegments.length === 0,
      "Trial explanation scan metadata leaked.",
    );
  }

  await Promise.all([
    assertMissingAssetReturns404(),
    assertNotPublicJson(`/${privateShardPaths[0]}`),
    assertNotPublicJson("/data/pdf-image-quiz.json"),
    assertNotPublicJson("/data/banks.json"),
    assertNotPublicBinary("/pdf-pages/investment/ch01/page-01.webp"),
    assertUnauthorizedApi(
      `/api/questions?resource=securities&action=chapter&path=${encodeURIComponent(privateShardPaths[0] || "")}`,
    ),
    assertUnauthorizedApi(
      "/api/questions?resource=foreign-exchange&action=questions&session=47&subject=remittance",
    ),
  ]);

  const token = await healthcheckAccessToken();
  if (token) {
    await assertAuthenticatedQuestionFlows(
      token,
      privateShardPaths[0] || "",
    );
  } else if (requireAuthenticatedQuestions) {
    throw new Error(
      "Authenticated question-bank health check is required, but no HEALTHCHECK_ACCESS_TOKEN or test account credentials were provided.",
    );
  } else {
    console.warn(
      "Authenticated question-bank smoke test skipped: no health-check test account was configured.",
    );
  }
}


function isFatalQuestionFunctionFailure(message: string): boolean {
  return /FUNCTION_INVOCATION_FAILED/i.test(message)
    || /\/api\/questions[^ ]* returned 500:/i.test(message)
    || /Cannot find module ['"].*manifest\.json/i.test(message);
}const startedAt = Date.now();
let attempt = 0;
let lastError: unknown = null;
let passed = false;

while (Date.now() - startedAt <= timeoutMs) {
  attempt += 1;
  try {
    await runChecks();
    console.log(
      `Production health check passed after ${attempt} attempt(s): ${baseUrl.origin}`,
    );
    passed = true;
    break;
  } catch (error) {
    lastError = error;
    const message = error instanceof Error ? error.message : String(error);
    if (isFatalQuestionFunctionFailure(message)) {
      console.error(
        `Production question function failed permanently on attempt ${attempt}: ${message}`,
      );
      break;
    }
    const elapsed = Date.now() - startedAt;
    if (elapsed + intervalMs > timeoutMs) break;
    console.warn(
      `Production not ready (attempt ${attempt}): ${message}`,
    );
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

if (!passed) {
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError || "Production health check failed."));
}

export {};
