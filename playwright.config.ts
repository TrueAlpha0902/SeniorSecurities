import { defineConfig, devices } from "@playwright/test";

const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4173";

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
    command: "npm run build && npm run preview -- --host 0.0.0.0 --port 4173",
    url: "http://127.0.0.1:4173/auth",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: "https://e2e.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "e2e-public-anon-key",
    },
  },
});
