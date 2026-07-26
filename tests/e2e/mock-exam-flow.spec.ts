import { expect, test } from "@playwright/test";

test("securities mock exam hides answers until explicit submission", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Focused mock flow runs once.");
  test.setTimeout(90_000);
  await page.goto("/random");
  await expect(page.getByRole("heading", { name: "模擬考", exact: true })).toBeVisible({ timeout: 20_000 });
  await page.locator('input[type="number"]').first().fill("1");
  await page.locator(".random-start-button").first().click();

  await expect(page.locator(".image-quiz-page")).toHaveAttribute("data-mock-exam-feedback-mode", "deferred");
  await expect(page.locator(".unified-quiz-timer")).toBeVisible();
  const options = page.locator(".glass-answer-button");
  await expect(options).toHaveCount(4, { timeout: 20_000 });
  await options.nth(0).click();
  await expect(page.locator(".image-answer-panel")).toHaveCount(0);
  await expect(page.locator(".glass-answer-correct, .glass-answer-wrong")).toHaveCount(0);
  await options.nth(1).click();
  await expect(options.nth(1)).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "交卷" }).click();
  const submitDialog = page.getByRole("alertdialog", { name: "確認交卷" });
  await expect(submitDialog).toBeVisible();
  await submitDialog.getByRole("button", { name: "確認交卷" }).click();
  await expect(page.getByRole("heading", { name: "練習完成" })).toBeVisible();
  await expect(page.locator(".submitted-exam-answer-card")).toBeVisible();
  await page.locator(".submitted-exam-answer-card-grid button").first().click();
  await expect(page.locator(".image-answer-panel")).toBeVisible();
  await expect(page.locator(".glass-answer-button").first()).toBeDisabled();
});

test("foreign-exchange mock exam also defers scoring server-side", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Focused mock flow runs once.");
  test.setTimeout(90_000);

  await page.goto("/foreign-exchange/practice?mode=mock&session=47&subject=remittance");
  await expect(page.locator(".fx-question-card")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".unified-quiz-timer")).toBeVisible();
  const options = page.locator(".fx-option");
  await expect(options).toHaveCount(4);
  await options.nth(0).click();
  await expect(page.locator(".fx-explanation")).toHaveCount(0);
  await expect(page.locator(".fx-option.is-correct, .fx-option.is-wrong")).toHaveCount(0);
  await options.nth(1).click();
  await expect(options.nth(1)).toHaveClass(/is-selected/);

  await page.getByRole("button", { name: "提前交卷" }).click();
  await expect(page.locator(".fx-result-banner")).toBeVisible();
  await expect(page.locator(".fx-explanation")).toBeVisible();
});
