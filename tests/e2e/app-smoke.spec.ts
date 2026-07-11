import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === "critical" || violation.impact === "serious",
  );
  expect(
    serious,
    serious.map((item) => `${item.id}: ${item.help}`).join("\n"),
  ).toEqual([]);
}

test("app boots, opens calculator and settings without a blank screen", async ({
  page,
}, testInfo) => {
  await page.goto("/auth");
  await expect(page.locator("#root")).not.toBeEmpty();
  await expect(
    page.getByRole("heading", { name: /登入|會員|尚未設定 Supabase/ }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "計算機" }).click();
  await expect(page.getByRole("dialog", { name: /計算機/ })).toBeVisible();
  await page.getByRole("button", { name: "關閉計算機" }).click();

  await page.getByRole("button", { name: "設定" }).click();
  await expect(page.getByRole("dialog", { name: "設定" })).toBeVisible();
  await page.getByRole("button", { name: "管理離線內容" }).click();
  await expect(page.getByText("離線科目包")).toBeVisible();
  await page.getByRole("button", { name: "回到設定" }).click();
  await page.getByRole("button", { name: "取消" }).click();

  await expectNoSeriousAccessibilityViolations(page);
  await page.screenshot({
    path: testInfo.outputPath("auth-shell.png"),
    fullPage: true,
  });
});

test("trial quiz restores visible correct and wrong answer states", async ({
  page,
}, testInfo) => {
  await page.goto("/trial");
  await expect(page.locator("#root")).not.toBeEmpty();
  await expect(page.getByRole("button", { name: /選擇 \(1\)/ })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: /選擇 \(1\)/ }).click();
  await expect(page.locator(".glass-answer-wrong")).toBeVisible();
  await expect(page.locator(".glass-answer-correct")).toBeVisible();
  await expect(page.locator(".glass-answer-wrong")).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator(".glass-answer-correct")).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
  await page.screenshot({
    path: testInfo.outputPath("trial-answer-colors.png"),
    fullPage: true,
  });
});

test("offline reload never collapses to an empty root", async ({
  page,
  context,
}) => {
  await page.goto("/auth");
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
  await expect(page.locator("#root")).not.toBeEmpty();
  await context.setOffline(false);
});
