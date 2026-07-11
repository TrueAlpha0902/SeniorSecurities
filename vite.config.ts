import { rm } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.VITE_BASE_PATH ?? "/";
const appName = "\u8b49\u5238\u9ad8\u696d";

function excludePublicBackupsFromBuild(): Plugin {
  let outputDirectory = "";

  return {
    name: "exclude-public-backups-from-build",
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

      // Vite copies public/ wholesale. Remove only the copied build artifact;
      // the source backups under public/data/backups are never modified.
      await rm(backupOutputDirectory, { recursive: true, force: true });
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
    react(),
    excludePublicBackupsFromBuild(),
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
        description: "Offline iPad quiz app for securities exam question banks.",
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
