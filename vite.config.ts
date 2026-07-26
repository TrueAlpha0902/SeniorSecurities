import { readFile, rm } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.VITE_BASE_PATH ?? "/";
const appName = "金融證照題庫";


function localForeignExchangePreviewApi(): Plugin {
  type PreviewQuestion = Record<string, unknown> & {
    id?: unknown;
    answer?: unknown;
    acceptedAnswers?: unknown;
    allAnsweredCredit?: unknown;
    automaticCredit?: unknown;
    explanation?: unknown;
    options?: Record<string, unknown>;
  };

  async function readRequestBody(request: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
    if (request.method !== "POST") return {};
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (!chunks.length) return {};
    try {
      const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }

  function sendPreviewJson(response: import("node:http").ServerResponse, status: number, payload: unknown): void {
    response.statusCode = status;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(JSON.stringify(payload));
  }

  function previewMockToken(questionIds: string[]): string {
    return Buffer.from(JSON.stringify({ questionIds }), "utf8").toString("base64url");
  }

  function parsePreviewMockToken(value: unknown): string[] {
    try {
      const parsed = JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8")) as { questionIds?: unknown };
      return Array.isArray(parsed.questionIds) ? parsed.questionIds.map(String) : [];
    } catch {
      return [];
    }
  }

  function toPreviewFullQuestion(question: PreviewQuestion): PreviewQuestion {
    return {
      id: question.id,
      bankTitle: question.bankTitle,
      chapter: question.chapter,
      question: question.question,
      options: question.options,
      answer: question.answer,
      acceptedAnswers: question.acceptedAnswers,
      allAnsweredCredit: question.allAnsweredCredit,
      automaticCredit: question.automaticCredit,
      answerNote: question.answerNote,
      explanation: question.explanation,
      session: question.session,
      subjectId: question.subjectId,
      questionNumber: question.questionNumber,
      standardVersion: question.standardVersion,
    };
  }

  function toPreviewMockQuestion(question: PreviewQuestion): PreviewQuestion {
    const full = toPreviewFullQuestion(question);
    delete full.answer;
    delete full.acceptedAnswers;
    delete full.allAnsweredCredit;
    delete full.automaticCredit;
    delete full.answerNote;
    delete full.explanation;
    return full;
  }

  function previewAnswerCorrect(question: PreviewQuestion, selected: unknown): boolean {
    if (question.automaticCredit) return true;
    if (!["A", "B", "C", "D"].includes(String(selected))) return false;
    if (question.allAnsweredCredit) return true;
    const accepted = Array.isArray(question.acceptedAnswers) && question.acceptedAnswers.length
      ? question.acceptedAnswers.map(String)
      : [String(question.answer || "")];
    return accepted.includes(String(selected));
  }

  let securitiesQuestionsPromise: Promise<Array<Record<string, unknown>>> | null = null;
  let foreignExchangeQuestionsPromise: Promise<PreviewQuestion[]> | null = null;

  async function loadSecuritiesPreviewQuestions(): Promise<Array<Record<string, unknown>>> {
    if (!securitiesQuestionsPromise) {
      securitiesQuestionsPromise = (async () => {
        const manifestPath = resolve(
          process.cwd(),
          "public",
          "data",
          "question-release-manifest.json",
        );
        const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
          banks: Array<{ bankId: string; chapters: Array<{ path: string }> }>;
        };
        const shards = await Promise.all(
          manifest.banks
            .flatMap((bank) => bank.chapters)
            .map(async (chapter) => {
              const source = await readFile(
                resolve(process.cwd(), "public", chapter.path),
                "utf8",
              );
              return JSON.parse(source) as {
                chapter: { questions: Array<Record<string, unknown>> };
              };
            }),
        );
        return shards.flatMap((shard) => shard.chapter.questions);
      })().catch((error) => {
        securitiesQuestionsPromise = null;
        throw error;
      });
    }

    return securitiesQuestionsPromise;
  }

  async function loadForeignExchangePreviewQuestions(): Promise<PreviewQuestion[]> {
    if (!foreignExchangeQuestionsPromise) {
      foreignExchangeQuestionsPromise = (async () => {
        const questions: PreviewQuestion[] = [];
        for (let currentSession = 23; currentSession <= 47; currentSession += 1) {
          for (const currentSubject of ["remittance", "trade"]) {
            const path = resolve(
              process.cwd(),
              "api",
              "_data",
              "foreign-exchange",
              `${currentSession}-${currentSubject}.json`,
            );
            const shard = JSON.parse(
              await readFile(path, "utf8"),
            ) as PreviewQuestion[];
            questions.push(...shard);
          }
        }
        return questions;
      })().catch((error) => {
        foreignExchangeQuestionsPromise = null;
        throw error;
      });
    }

    return foreignExchangeQuestionsPromise;
  }

  return {
    name: "local-foreign-exchange-preview-api",
    apply: "serve",
    configureServer(server) {
      if (process.env.VITE_LOCAL_PREVIEW_ACCESS !== "1") return;

      const handler = async (
        request: import("node:http").IncomingMessage,
        response: import("node:http").ServerResponse,
      ) => {
        try {
          const requestUrl = new URL(request.url || "", "http://local.preview");
          const body = await readRequestBody(request);
          const resource = String(body.resource || requestUrl.searchParams.get("resource") || "foreign-exchange");
          const action = String(body.action || requestUrl.searchParams.get("action") || "questions");
          const session = String(body.session ?? requestUrl.searchParams.get("session") ?? "");
          const subject = String(body.subject ?? requestUrl.searchParams.get("subject") ?? "");
          const idsText = body.ids ?? requestUrl.searchParams.get("ids") ?? "";
          const ids = new Set((Array.isArray(idsText) ? idsText : String(idsText).split(",")).map(String).filter(Boolean));

          if (resource === "securities") {
            const allSecuritiesQuestions = await loadSecuritiesPreviewQuestions();
            const securitiesById = new Map(allSecuritiesQuestions.map((question) => [String(question.id || ""), question]));
            const toMockQuestion = (question: Record<string, unknown>) => ({
              id: question.id,
              bankId: question.bankId,
              bankTitle: question.bankTitle,
              chapterId: question.chapterId,
              chapterTitle: question.chapterTitle,
              chapterTopic: question.chapterTopic,
              number: question.number,
              questionText: question.questionText,
              optionTexts: question.optionTexts,
              sourceFile: "",
              questionSegments: [],
              explanationSegments: [],
              answerMask: null,
            });

            if (action === "search") {
              const query = String(body.query || requestUrl.searchParams.get("query") || "").trim().toLowerCase().replace(/\s+/g, " ");
              const limit = Math.min(80, Math.max(1, Number(body.limit || requestUrl.searchParams.get("limit") || 80)));
              const results: Array<Record<string, unknown>> = [];
              for (const question of allSecuritiesQuestions) {
                const optionTexts = question.optionTexts as Record<string, unknown> | undefined;
                const haystack = [question.bankTitle, question.chapterTitle, question.chapterTopic, question.number, question.questionText, optionTexts?.["1"], optionTexts?.["2"], optionTexts?.["3"], optionTexts?.["4"], question.explanationText]
                  .filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, " ");
                if (!haystack.includes(query)) continue;
                results.push({
                  examId: "senior-securities",
                  id: question.id,
                  bankId: question.bankId,
                  bankTitle: question.bankTitle,
                  chapterId: question.chapterId,
                  chapterTitle: [question.chapterTitle, question.chapterTopic].filter(Boolean).join(" "),
                  questionNumber: question.number,
                  question: question.questionText,
                });
                if (results.length >= limit) break;
              }
              sendPreviewJson(response, 200, { examId: "senior-securities", results });
              return;
            }

            if (action === "mock-resume" || action === "mock-submit") {
              const questionIds = parsePreviewMockToken(body.mockToken);
              const questions = questionIds.map((id) => securitiesById.get(id)).filter((question): question is Record<string, unknown> => Boolean(question));
              if (questions.length !== questionIds.length) {
                sendPreviewJson(response, 409, { error: "模擬考題目版本已變更。" });
                return;
              }
              if (action === "mock-resume") {
                sendPreviewJson(response, 200, { examId: "senior-securities", mockToken: body.mockToken, questions: questions.map(toMockQuestion) });
                return;
              }
              const answerSource = typeof body.answers === "object" && body.answers !== null && !Array.isArray(body.answers)
                ? body.answers as Record<string, unknown>
                : {};
              const results = questions.map((question) => {
                const selectedAnswer = String(answerSource[String(question.id || "")] || "");
                const valid = ["1", "2", "3", "4"].includes(selectedAnswer);
                return {
                  ...toMockQuestion(question),
                  answer: question.answer,
                  explanationText: question.explanationText,
                  selectedAnswer: valid ? selectedAnswer : null,
                  isCorrect: valid && selectedAnswer === String(question.answer || ""),
                };
              });
              sendPreviewJson(response, 200, {
                examId: "senior-securities",
                questionCount: results.length,
                correctCount: results.filter((question) => question.isCorrect).length,
                results,
              });
              return;
            }

            if (action === "mock-start") {
              const bankId = String(body.bankId || "");
              const sourceBankIds = bankId === "securities-laws-practice"
                ? new Set(["securities-trading-regulations", "securities-trading-practice"])
                : new Set([bankId]);
              const avoidIds = new Set((Array.isArray(body.avoidIds) ? body.avoidIds : String(body.avoidIds || "").split(",")).map(String).filter(Boolean));
              const count = Math.min(300, Math.max(1, Number(body.randomCount || 50)));
              const candidates = allSecuritiesQuestions
                .filter((question) => sourceBankIds.has(String(question.bankId || "")))
                .filter((question) => !avoidIds.has(String(question.id || "")));
              const fallback = candidates.length ? candidates : allSecuritiesQuestions.filter((question) => sourceBankIds.has(String(question.bankId || "")));
              const questions = [...fallback].sort(() => Math.random() - 0.5).slice(0, count);
              const token = previewMockToken(questions.map((question) => String(question.id || "")));
              sendPreviewJson(response, 200, { examId: "senior-securities", mockToken: token, questions: questions.map(toMockQuestion) });
              return;
            }

            sendPreviewJson(response, 400, { error: "Local securities preview action is not supported." });
            return;
          }

          const allQuestions = await loadForeignExchangePreviewQuestions();
          const byId = new Map(allQuestions.map((question) => [String(question.id || ""), question]));

          if (action === "search") {
            const query = String(body.query || requestUrl.searchParams.get("query") || "").trim().toLowerCase().replace(/\s+/g, " ");
            const limit = Math.min(80, Math.max(1, Number(body.limit || requestUrl.searchParams.get("limit") || 80)));
            const results = allQuestions
              .filter((question) => [question.bankTitle, `第${question.session}屆`, question.standardVersion, question.question, question.options?.A, question.options?.B, question.options?.C, question.options?.D, question.explanation]
                .filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, " ").includes(query))
              .slice(0, limit)
              .map((question) => ({
                examId: "junior-foreign-exchange",
                id: question.id,
                session: question.session,
                subjectId: question.subjectId,
                bankTitle: question.bankTitle,
                questionNumber: question.questionNumber,
                question: question.question,
              }));
            sendPreviewJson(response, 200, { examId: "junior-foreign-exchange", results });
            return;
          }

          if (action === "mock-resume" || action === "mock-submit") {
            const questionIds = parsePreviewMockToken(body.mockToken);
            const questions = questionIds.map((id) => byId.get(id)).filter((question): question is PreviewQuestion => Boolean(question));
            if (questions.length !== questionIds.length) {
              sendPreviewJson(response, 409, { error: "模擬考題目版本已變更。" });
              return;
            }
            if (action === "mock-resume") {
              sendPreviewJson(response, 200, { examId: "junior-foreign-exchange", mockToken: body.mockToken, questions: questions.map(toPreviewMockQuestion) });
              return;
            }
            const answerSource = typeof body.answers === "object" && body.answers !== null && !Array.isArray(body.answers)
              ? body.answers as Record<string, unknown>
              : {};
            const results = questions.map((question) => ({
              ...toPreviewFullQuestion(question),
              selectedAnswer: answerSource[String(question.id || "")] ?? null,
              isCorrect: previewAnswerCorrect(question, answerSource[String(question.id || "")]),
            }));
            sendPreviewJson(response, 200, {
              examId: "junior-foreign-exchange",
              questionCount: results.length,
              correctCount: results.filter((question) => question.isCorrect).length,
              results,
            });
            return;
          }

          let questions = allQuestions
            .filter((question) => !session || String(question.session) === session)
            .filter((question) => !subject || String(question.subjectId) === subject)
            .filter((question) => !ids.size || ids.has(String(question.id || "")));
          const randomCount = Number(body.randomCount || requestUrl.searchParams.get("randomCount") || 0);
          if (Number.isInteger(randomCount) && randomCount > 0) {
            questions = [...questions].sort(() => Math.random() - 0.5).slice(0, randomCount);
          }
          if (action === "mock-start") {
            const token = previewMockToken(questions.map((question) => String(question.id || "")));
            sendPreviewJson(response, 200, { examId: "junior-foreign-exchange", mockToken: token, questions: questions.map(toPreviewMockQuestion) });
            return;
          }
          const projected = questions.map(toPreviewFullQuestion);
          sendPreviewJson(response, 200, { examId: "junior-foreign-exchange", questionCount: projected.length, questions: projected });
        } catch (error) {
          sendPreviewJson(response, 500, { error: error instanceof Error ? error.message : "Preview API failed." });
        }
      };

      server.middlewares.use("/api/questions", handler);
      server.middlewares.use("/api/foreign-exchange/questions", handler);
    },
  };
}

function excludeEditorSourcesFromBuild(): Plugin {
  let outputDirectory = "";

  return {
    name: "exclude-editor-sources-from-build",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir);
      const canonicalOutputDirectory = resolve(config.root, "dist");
      if (outputDirectory !== canonicalOutputDirectory) {
        throw new Error(`Refusing backup cleanup outside the canonical dist directory: ${outputDirectory}`);
      }
    },
    async writeBundle() {
      const backupOutputDirectory = resolve(outputDirectory, "data", "backups");
      const relativeBackupPath = relative(outputDirectory, backupOutputDirectory).replaceAll("\\", "/");

      if (relativeBackupPath !== "data/backups") {
        throw new Error(`Refusing to remove unexpected build path: ${backupOutputDirectory}`);
      }

      const editorSourceOutputPath = resolve(
        outputDirectory,
        "data",
        "pdf-image-quiz.json",
      );
      const relativeEditorSourcePath = relative(
        outputDirectory,
        editorSourceOutputPath,
      ).replaceAll("\\", "/");
      if (relativeEditorSourcePath !== "data/pdf-image-quiz.json") {
        throw new Error(
          `Refusing to remove unexpected build path: ${editorSourceOutputPath}`,
        );
      }

      const scanPagesOutputPath = resolve(outputDirectory, "pdf-pages");
      const relativeScanPagesPath = relative(outputDirectory, scanPagesOutputPath).replaceAll("\\", "/");
      if (relativeScanPagesPath !== "pdf-pages") {
        throw new Error(`Refusing to remove unexpected scan path: ${scanPagesOutputPath}`);
      }

      const publicQuestionShardsOutputPath = resolve(outputDirectory, "data", "question-shards");
      const relativeQuestionShardsPath = relative(outputDirectory, publicQuestionShardsOutputPath).replaceAll("\\", "/");
      if (relativeQuestionShardsPath !== "data/question-shards") {
        throw new Error(`Refusing to remove unexpected question-shard path: ${publicQuestionShardsOutputPath}`);
      }

      const legacyBankCatalogOutputPath = resolve(outputDirectory, "data", "banks.json");
      const relativeLegacyBankCatalogPath = relative(outputDirectory, legacyBankCatalogOutputPath).replaceAll("\\", "/");
      if (relativeLegacyBankCatalogPath !== "data/banks.json") {
        throw new Error(`Refusing to remove unexpected legacy bank catalog: ${legacyBankCatalogOutputPath}`);
      }

      const legacyBanksOutputPath = resolve(outputDirectory, "data", "banks");
      const relativeLegacyBanksPath = relative(outputDirectory, legacyBanksOutputPath).replaceAll("\\", "/");
      if (relativeLegacyBanksPath !== "data/banks") {
        throw new Error(`Refusing to remove unexpected legacy bank directory: ${legacyBanksOutputPath}`);
      }

      // Vite copies public/ wholesale. Raw editor inputs, local backups, source
      // scans and paid question shards are never learner-facing public assets.
      // The authenticated /api/questions function bundles the shards privately.
      await Promise.all([
        rm(backupOutputDirectory, { recursive: true, force: true }),
        rm(editorSourceOutputPath, { force: true }),
        rm(scanPagesOutputPath, { recursive: true, force: true }),
        rm(publicQuestionShardsOutputPath, { recursive: true, force: true }),
        rm(legacyBankCatalogOutputPath, { force: true }),
        rm(legacyBanksOutputPath, { recursive: true, force: true }),
      ]);
    },
  };
}

export default defineConfig({
  base,
  build: {
    target: "es2022",
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replaceAll("\\", "/");

          if (
            moduleId.includes("/node_modules/react/") ||
            moduleId.includes("/node_modules/react-dom/") ||
            moduleId.includes("/node_modules/react-router/") ||
            moduleId.includes("/node_modules/react-router-dom/") ||
            moduleId.includes("/node_modules/scheduler/")
          ) {
            return "react-vendor";
          }

          if (moduleId.includes("/node_modules/@supabase/")) {
            return "supabase-vendor";
          }

          if (moduleId.includes("/node_modules/ts-fsrs/")) {
            return "learning-vendor";
          }

          if (moduleId.includes("/node_modules/@vercel/analytics/")) {
            return "analytics-vendor";
          }

          return undefined;
        },
      },
    },
  },
  plugins: [
    localForeignExchangePreviewApi(),
    react(),
    excludeEditorSourcesFromBuild(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "icons/icon-180.png",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/maskable-512.png",
      ],
      manifest: {
        name: appName,
        short_name: appName,
        description: "金融證照題庫練習 App。",
        theme_color: "#f4f7fb",
        background_color: "#f4f7fb",
        display: "standalone",
        lang: "zh-Hant",
        orientation: "any",
        scope: base,
        start_url: base,
        icons: [
          {
            src: "icons/icon-180.png",
            sizes: "180x180",
            type: "image/png",
          },
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Keep the initial service-worker install small. Learner production is
        // text-first and excludes the authoring scan pages entirely.
        globPatterns: ["**/*.{js,css,html,ico,svg,json,webmanifest}"],
        globIgnores: [
          "**/pdf-pages/**",
          "**/data/backups/**",
          "**/data/pdf-image-quiz.json",
          "**/data/question-shards/**",
          "**/data/question-release-manifest.json",
          "**/data/pdf-image-quiz-summary.json",
          "**/data/pdf-image-quiz-plan-index.json",
          "**/data/pdf-image-quiz-trial.json",
          "**/data/similar-question-groups.json",
        ],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: "index.html",
        navigationPreload: true,
        skipWaiting: false,
        clientsClaim: false,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              /\/data\/(?:question-release-manifest|pdf-image-quiz-summary|pdf-image-quiz-plan-index|pdf-image-quiz-trial|similar-question-groups)\.json$/.test(
                url.pathname,
              ),
            handler: "NetworkFirst",
            options: {
              cacheName: "question-bank-metadata-v92",
              networkTimeoutSeconds: 8,
              expiration: {
                maxEntries: 12,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes("/data/"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "question-bank-data",
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
});
