import { supabase } from "./supabase";

export type QuestionBankErrorCode =
  | "configuration"
  | "authentication"
  | "authorization"
  | "migration"
  | "network"
  | "server"
  | "invalid-response";

export class QuestionBankError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: QuestionBankErrorCode,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "QuestionBankError";
  }
}

type QuestionBankRequestOptions = {
  url: string;
  context: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  signal?: AbortSignal;
  cache?: RequestCache;
  headers?: HeadersInit;
};

export type QuestionBankAccess = {
  token: string;
  account: string;
};

type ErrorPayload = {
  error?: unknown;
};

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw abortError();

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener("abort", handleAbort);
    };
    const handleAbort = () => {
      cleanup();
      reject(abortError());
    };
    const timer = globalThis.setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

async function readSession(forceRefresh: boolean): Promise<QuestionBankAccess> {
  if (!supabase) {
    throw new QuestionBankError(
      "題庫登入服務尚未設定，請確認正式環境的 Supabase 公開連線設定。",
      0,
      "configuration",
      false,
    );
  }

  const result = forceRefresh
    ? await supabase.auth.refreshSession()
    : await supabase.auth.getSession();

  if (result.error) {
    throw new QuestionBankError(
      forceRefresh
        ? "登入狀態更新失敗，請重新登入後再試。"
        : "無法讀取目前登入狀態，請稍後再試。",
      401,
      "authentication",
      false,
    );
  }

  const session = result.data.session;
  if (!session?.access_token) {
    if (!forceRefresh) return readSession(true);
    throw new QuestionBankError(
      "登入狀態已過期，請重新登入後再載入題庫。",
      401,
      "authentication",
      false,
    );
  }

  return {
    token: session.access_token,
    account: session.user.id,
  };
}

export async function getQuestionBankAccess(): Promise<QuestionBankAccess> {
  return readSession(false);
}

async function readResponseError(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") || "";
  if (/application\/json/i.test(contentType)) {
    try {
      const payload = await response.json() as ErrorPayload;
      const message = String(payload.error || "").trim();
      if (message) return message;
    } catch {
      // Fall through to a status-based message.
    }
  } else {
    try {
      const text = (await response.text()).trim();
      if (text) return text.slice(0, 240);
    } catch {
      // Fall through to a status-based message.
    }
  }
  return "";
}

function mapHttpError(
  status: number,
  serverMessage: string,
  context: string,
): QuestionBankError {
  if (status === 401) {
    return new QuestionBankError(
      serverMessage || "登入狀態已過期，請重新登入後再試。",
      status,
      "authentication",
      false,
    );
  }

  if (status === 403) {
    return new QuestionBankError(
      serverMessage || "這個帳號尚未開通目前題庫。",
      status,
      "authorization",
      false,
    );
  }

  if (
    status === 503 &&
    /尚未部署|migration|schema|table|relation|環境變數|設定/i.test(serverMessage)
  ) {
    return new QuestionBankError(
      serverMessage || "題庫權限或伺服器設定尚未完成部署。",
      status,
      "migration",
      false,
    );
  }

  if (status === 408 || status === 425 || status === 429 || status === 502 || status === 504) {
    return new QuestionBankError(
      serverMessage || `${context}暫時忙碌，請稍後再試。`,
      status,
      "network",
      true,
    );
  }

  if (status >= 500) {
    return new QuestionBankError(
      serverMessage || `${context}服務暫時無法使用，請稍後再試。`,
      status,
      "server",
      status === 500 || status === 503,
    );
  }

  return new QuestionBankError(
    serverMessage || `${context}請求失敗（${status}）。`,
    status,
    "invalid-response",
    false,
  );
}

export async function fetchQuestionBankResponse(
  options: QuestionBankRequestOptions,
): Promise<Response> {
  let forceRefresh = false;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const access = await readSession(forceRefresh);
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${access.token}`);
    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    let response: Response;
    try {
      response = await fetch(options.url, {
        method: options.method ?? (options.body ? "POST" : "GET"),
        cache: options.cache ?? "no-store",
        credentials: "same-origin",
        signal: options.signal,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      lastError = error;
      if (attempt === 0) {
        await waitForRetry(350, options.signal);
        continue;
      }
      throw new QuestionBankError(
        `${options.context}連線失敗，請確認網路後重新載入。`,
        0,
        "network",
        true,
      );
    }

    if (response.status === 401 && !forceRefresh) {
      forceRefresh = true;
      continue;
    }

    if (response.ok) return response;

    const mapped = mapHttpError(
      response.status,
      await readResponseError(response),
      options.context,
    );
    lastError = mapped;

    if (mapped.retryable && attempt === 0) {
      await waitForRetry(450, options.signal);
      continue;
    }

    throw mapped;
  }

  if (lastError instanceof Error) throw lastError;
  throw new QuestionBankError(
    `${options.context}載入失敗。`,
    0,
    "network",
    true,
  );
}

export async function requestQuestionBankJson<T>(
  options: QuestionBankRequestOptions,
): Promise<T> {
  const response = await fetchQuestionBankResponse(options);
  const contentType = response.headers.get("content-type") || "";
  if (!/application\/json/i.test(contentType)) {
    throw new QuestionBankError(
      `${options.context}回傳了無法辨識的內容，請重新部署後再試。`,
      response.status,
      "invalid-response",
      false,
    );
  }

  try {
    return await response.json() as T;
  } catch {
    throw new QuestionBankError(
      `${options.context}回傳了無效的 JSON，請重新部署後再試。`,
      response.status,
      "invalid-response",
      false,
    );
  }
}
