import { readFile, rm } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.VITE_BASE_PATH ?? "/";
const appName = "金融證照題庫";


function localForeignExchangePreviewApi(): Plugin {
  return {
    name: "local-foreign-exchange-preview-api",
    apply: "serve",
    configureServer(server) {
      if (process.env.VITE_LOCAL_PREVIEW_ACCESS !== "1") return;
      server.middlewares.use("/api/foreign-exchange/questions", async (request, response) => {
        try {
          const requestUrl = new URL(request.url || "", "http://local.preview");
          const session = requestUrl.searchParams.get("session");
          const subject = requestUrl.searchParams.get("subject");
          const ids = new Set((requestUrl.searchParams.get("ids") || "").split(",").filter(Boolean));
          const allQuestions: Array<Record<string, unknown>> = [];
          for (const currentSession of [45, 46, 47]) {
            for (const currentSubject of ["remittance", "trade"]) {
              if (session && String(currentSession) !== session) continue;
              if (subject && currentSubject !== subject) continue;
              const path = resolve(
                process.cwd(),
                "api",
                "_data",
                "foreign-exchange",
                `${currentSession}-${currentSubject}.json`,
              );
              const shard = JSON.parse(await readFile(path, "utf8")) as Array<Record<string, unknown>>;
              allQuestions.push(...shard);
            }
          }
          const questions = allQuestions
            .filter((question) => !ids.size || ids.has(String(question.id || "")))
            .map((question) => ({
              id: question.id,
              bankTitle: question.bankTitle,
              chapter: question.chapter,
              question: question.question,
              options: question.options,
              answer: question.answer,
              explanation: question.explanation,
              session: question.session,
              subjectId: question.subjectId,
              questionNumber: question.questionNumber,
              standardVersion: question.standardVersion,
            }));
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(JSON.stringify({ examId: "junior-foreign-exchange", questionCount: questions.length, questions }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Preview API failed." }));
        }
      });
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

      // Vite copies public/ wholesale. The raw editor source and local backups
      // are repository authoring inputs, not runtime assets. The production app
      // reads content-hashed chapter shards instead.
      await Promise.all([
        rm(backupOutputDirectory, { recursive: true, force: true }),
        rm(editorSourceOutputPath, { force: true }),
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
        theme_color: "#ffffff",
        background_color: "#ffffff",
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
        // Keep the initial service-worker install small. The PDF page images are
        // ~190 MB in total, so pre-caching every image makes first launch and
        // updates feel sluggish on mobile. They are cached on demand below.
        globPatterns: ["**/*.{js,css,html,ico,svg,json,webmanifest}"],
        globIgnores: [
          "**/pdf-pages/**",
          "**/data/backups/**",
          "**/data/pdf-image-quiz.json",
          "**/data/question-shards/**",
        ],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: "index.html",
        navigationPreload: true,
        skipWaiting: false,
        clientsClaim: false,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
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
          {
            urlPattern: ({ url }) => url.pathname.includes("/pdf-pages/"),
            handler: "CacheFirst",
            options: {
              cacheName: "question-bank-assets",
              expiration: {
                maxEntries: 1200,
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
