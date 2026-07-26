import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { clickGlobalUtility } from "./v93-test-helpers";

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
  expect(
    serious,
    serious.map((item) => `${item.id}: ${item.help}`).join("\n"),
  ).toEqual([]);
}

async function expectNavigationInNormalFlow(page: Page, selector: string) {
  const position = await page.locator(selector).evaluate((element) =>
    window.getComputedStyle(element).position,
  );
  expect(position).toBe("static");
}

async function expectLightSurface(page: Page, selector: string) {
  const backgrounds = await page.locator(selector).evaluateAll((elements) =>
    elements.map((element) => window.getComputedStyle(element).backgroundColor),
  );

  expect(
    backgrounds.length,
    `Expected at least one light surface for ${selector}`,
  ).toBeGreaterThan(0);

  for (const background of backgrounds) {
    const channels = background.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [];
    expect(channels, `Unable to parse ${selector} background: ${background}`).toHaveLength(3);
    expect(
      Math.min(...channels),
      `${selector} must use a light surface, got ${background}`,
    ).toBeGreaterThan(225);
  }
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("catalog, calculator and five subject plans render without a blank screen", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.locator("#root")).not.toBeEmpty();
  await expect(page.getByRole("heading", { name: "選擇題庫" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "證券高業" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "初階外匯" })).toBeVisible();
  await expect(page.getByText("3考科", { exact: true })).toBeVisible();
  await expect(page.getByText("2考科／25屆", { exact: true })).toBeVisible();
  await expect(page.getByText("共6,776題")).toHaveCount(0);
  await expect(page.getByText(/正確率/)).toHaveCount(0);
  await expectLightSurface(page, ".v90-app-stage");

  await clickGlobalUtility(page, "計算機");
  await expect(page.getByRole("dialog", { name: /計算機/ })).toBeVisible();
  await page.getByRole("button", { name: "關閉計算機" }).click();

  await clickGlobalUtility(page, "設定");
  const settings = page.getByRole("dialog", { name: "設定" });
  await expect(settings).toBeVisible();
  await settings.getByRole("tab", { name: "考試計畫" }).click();
  await expectLightSurface(page, ".settings-section-panel");
  await expectLightSurface(page, ".settings-section-panel > header");
  for (const subject of [
    "投資學",
    "財務分析",
    "證券相關法規與實務",
    "國外匯兌業務",
    "進出口外匯業務",
  ]) {
    await expect(settings.getByText(subject, { exact: true })).toBeVisible();
  }
  await expect(settings.getByText("證券交易相關法規", { exact: true })).toHaveCount(0);
  await expect(settings.getByText("證券交易相關實務", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "關閉設定" }).click();

  await expectNoSeriousAccessibilityViolations(page);
  await page.screenshot({ path: testInfo.outputPath("catalog.png"), fullPage: true });
});

test("securities home presents exactly three official subjects", async ({ page }) => {
  await page.goto("/securities");
  await expect(page.getByRole("region", { name: "證券高業學習概況" })).toBeVisible({ timeout: 20_000 });
  const subjects = page.locator("#learning-path .v90-subject-path > li");
  await expect(subjects).toHaveCount(3);
  await expectLightSurface(page, ".v90-paper-card");
  await expectLightSurface(page, ".v90-home-section");
  await expectLightSurface(page, ".v90-path-content");
  await expect(page.getByRole("heading", { name: "投資學", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "財務分析", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "證券相關法規與實務", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "證券交易相關法規", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "證券交易相關實務", exact: true })).toHaveCount(0);
});

test("securities general practice is untimed, text-only and reveals a neutral explanation", async ({
  page,
}, testInfo) => {
  await page.goto("/image-quiz/bank/investment/chapter/%E7%AC%AC%E4%B8%80%E7%AB%A0");
  await expect(page.locator(".image-quiz-page")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".scan-text-question")).toContainText("貨幣市場");
  await expect(page.locator(".glass-answer-button")).toHaveCount(4);
  await expect(page.locator(".unified-quiz-timer")).toHaveCount(0);
  await expect(page.locator(".pdf-segment-stack")).toHaveCount(0);
  await expect(page.getByText(/查看原始題圖|查看原始解析圖|原圖/)).toHaveCount(0);

  await page.getByRole("button", { name: /選擇 [（(]1[）)]/ }).click();
  await expect(page.locator(".image-answer-panel")).toBeVisible();
  await expect(page.locator(".answer-result-label").first()).toBeVisible();
  await expect(page.locator(".unified-explanation-surface")).toBeVisible();
  await expectLightSurface(page, ".image-quiz-controls");
  await expectLightSurface(page, ".unified-explanation-surface");
  await expectNavigationInNormalFlow(page, ".image-quiz-controls");

  await expectNoSeriousAccessibilityViolations(page);
  await page.screenshot({ path: testInfo.outputPath("securities-answer.png"), fullPage: true });
});

test("foreign-exchange shows all sessions, custom random count and untimed general practice", async ({
  page,
}, testInfo) => {
  await page.goto("/foreign-exchange");
  await expect(page.getByRole("heading", { name: "初階外匯", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "歷屆試題" })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "隨機題數" })).toBeVisible();
  await expect(page.getByRole("button", { name: "47屆", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "46屆", exact: true })).toBeVisible();
  await expect(page.getByText("制式", { exact: true })).toHaveCount(0);

  await page.goto("/foreign-exchange/practice?mode=practice&session=47&subject=remittance");
  await expect(page.locator(".fx-question-card")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".fx-option")).toHaveCount(4);
  await expect(page.locator(".unified-quiz-timer")).toHaveCount(0);
  await expect(page.locator(".fx-explanation")).toHaveCount(0);
  await page.locator(".fx-option").first().click();
  await expect(page.locator(".answer-result-label").first()).toBeVisible();
  await expect(page.locator(".fx-explanation")).toBeVisible();
  await expectLightSurface(page, ".fx-quiz-actions");
  await expectLightSurface(page, ".fx-explanation");
  await expectNavigationInNormalFlow(page, ".fx-quiz-actions");

  await page.screenshot({ path: testInfo.outputPath("foreign-exchange-answer.png"), fullPage: true });
});

test("mock exams alone show timers", async ({ page }) => {
  await page.goto("/foreign-exchange/practice?mode=mock&session=47&subject=remittance");
  await expect(page.locator(".fx-question-card")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".unified-quiz-timer")).toBeVisible();
  await expect(page.locator(".unified-quiz-timer")).toContainText("剩餘時間");
});

test("authenticated search returns only question summaries", async ({ page }) => {
  await page.goto("/search");
  await expect(page.getByRole("heading", { name: "搜尋題目" })).toBeVisible();
  await page.getByRole("searchbox", { name: "搜尋題目" }).fill("公司債");
  await expect(page.locator(".product-search-result").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/正確答案|解析內容/)).toHaveCount(0);
});

test("mobile next-question navigation stays at the document end and never pushes the viewport down", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile layout only");
  await page.goto("/image-quiz/bank/investment/chapter/%E7%AC%AC%E4%B8%80%E7%AB%A0");
  await expect(page.locator(".image-quiz-page")).toBeVisible({ timeout: 20_000 });
  await page.locator(".glass-answer-button").first().click();
  await expect(page.locator(".image-answer-panel")).toBeVisible();
  await expectNavigationInNormalFlow(page, ".image-quiz-controls");

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const explanationBox = await page.locator(".unified-explanation-surface").boundingBox();
  const controlsBox = await page.locator(".image-quiz-controls").boundingBox();
  expect(explanationBox).not.toBeNull();
  expect(controlsBox).not.toBeNull();
  expect(explanationBox!.y + explanationBox!.height).toBeLessThanOrEqual(controlsBox!.y + 2);

  const before = await page.evaluate(() => window.scrollY);
  await page.getByRole("button", { name: /下一題/ }).last().click();
  await expect(page.locator(".active-question-panel")).toBeVisible();
  const after = await page.evaluate(() => window.scrollY);
  expect(after).toBeLessThanOrEqual(before);
});

test("offline reload never collapses to an empty root", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
    await expect(page.locator("#root")).not.toBeEmpty();
  } finally {
    await context.setOffline(false);
  }
});
