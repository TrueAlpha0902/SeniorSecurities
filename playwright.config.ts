import { defineConfig, devices } from "@playwright/test";

const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const previewHost = process.env.PLAYWRIGHT_PREVIEW_HOST || "127.0.0.1";
const previewPort = Number(process.env.PLAYWRIGHT_PREVIEW_PORT || 4173);
if (!Number.isInteger(previewPort) || previewPort < 1024 || previewPort > 65_535) {
  throw new Error(`Invalid PLAYWRIGHT_PREVIEW_PORT: ${process.env.PLAYWRIGHT_PREVIEW_PORT || ""}`);
}
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://${previewHost}:${previewPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 8_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    serviceWorkers: "allow",
    locale: "zh-TW",
    launchOptions: chromiumExecutablePath
      ? {
          executablePath: chromiumExecutablePath,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--no-proxy-server",
            "--proxy-bypass-list=<-loopback>",
            "--host-resolver-rules=MAP app.test 127.0.0.1",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--use-gl=swiftshader",
          ],
        }
      : undefined,
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "ipad-chromium",
      use: { ...devices["iPad Pro 11"], browserName: "chromium" },
    },
    { name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "ipad-webkit", use: { ...devices["iPad Pro 11"] } },
  ],
  webServer: {
    // Browser interaction tests use the Vite development server so the
    // explicitly gated local preview account and local /api/questions
    // middleware are active. npm run verify still performs the production
    // TypeScript and Vite build before this focused browser suite runs.
    command: `npm run dev -- --host ${previewHost} --port ${previewPort}`,
    url: `${baseURL}/auth`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_LOCAL_PREVIEW_ACCESS: "1",
    },
  },
});
