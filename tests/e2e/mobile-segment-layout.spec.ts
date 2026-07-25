import { expect, test } from "@playwright/test";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

test("catalog and exam cards remain readable without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "選擇題庫" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const cards = page.locator(".product-exam-card");
  await expect(cards).toHaveCount(2);
  for (const card of await cards.all()) {
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(280);
  }
});

test("text question and bottom navigation do not overlap on phone", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) > 600);
  await page.goto("/image-quiz/bank/investment/chapter/%E7%AC%AC%E4%B8%80%E7%AB%A0");
  await expect(page.locator(".scan-text-question")).toBeVisible({ timeout: 20_000 });
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: /選擇 \(1\)/ }).click();
  await expect(page.locator(".unified-explanation-surface")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const explanation = await page.locator(".unified-explanation-surface").boundingBox();
  const controlsLocator = page.getByRole("navigation", { name: /題目導覽/ });
  await expect(controlsLocator).toHaveCSS("position", "static");
  const controls = await controlsLocator.boundingBox();
  expect(explanation).not.toBeNull();
  expect(controls).not.toBeNull();
  expect(explanation!.y + explanation!.height).toBeLessThanOrEqual(controls!.y + 2);
});

test("foreign-exchange history switches to a compact mobile layout", async ({ page }) => {
  await page.goto("/foreign-exchange");
  await expect(page.locator(".fx-history-row").first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const firstRow = page.locator(".fx-history-row").first();
  await expect(firstRow.getByText(/國外匯兌業務/)).toBeVisible();
  await expect(firstRow.getByText(/進出口外匯業務/)).toBeVisible();
});
