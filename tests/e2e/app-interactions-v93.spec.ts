import { expect, test, type Page } from "@playwright/test";
import { clickGlobalUtility, expectHashTargetInUsefulViewport } from "./v93-test-helpers";

async function expectDarkReadableRoot(page: Page) {
  const colors = await page.locator("body").evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      background: style.backgroundColor,
      text: style.color,
    };
  });

  function channels(value: string): number[] {
    return value.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [];
  }

  const background = channels(colors.background);
  const text = channels(colors.text);
  expect(background).toHaveLength(3);
  expect(text).toHaveLength(3);
  expect(Math.max(...background)).toBeLessThan(40);
  expect(Math.min(...text)).toBeGreaterThan(210);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("dark theme is the default and no dead notification button remains", async ({
  page,
}) => {
  await page.goto("/securities");
  await expect(page.locator(".theme-v93")).toBeVisible({ timeout: 20_000 });
  await expectDarkReadableRoot(page);
  await expect(page.getByRole("button", { name: "通知" })).toHaveCount(0);
});

test("hash destinations scroll, receive focus and report feedback", async ({
  page,
}) => {
  await page.goto("/securities#learning-path");
  const target = page.locator("#learning-path");
  await expect(target).toBeVisible({ timeout: 20_000 });
  await expect(target).toBeFocused();
  await expect(page.getByRole("status")).toContainText("已前往");

  await expectHashTargetInUsefulViewport(page, target);
});

test("settings and calculator immediately expose visible feedback", async ({ page }) => {
  await page.goto("/");

  await clickGlobalUtility(page, "設定");
  await expect(page.getByRole("dialog", { name: "設定" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "關閉設定" }).click();

  await clickGlobalUtility(page, "計算機");
  await expect(page.getByRole("dialog", { name: /計算機/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "關閉計算機" }).click();
});

test("securities search result opens the exact requested question", async ({ page }) => {
  await page.goto("/search");
  await page.getByRole("searchbox", { name: "搜尋題目" }).fill("公司債");
  const result = page.locator(".product-search-result").first();
  await expect(result).toBeVisible({ timeout: 20_000 });

  const targetLink = result.getByRole("link").filter({ hasText: "前往題目" });
  const href = await targetLink.getAttribute("href");
  expect(href).toBeTruthy();
  const jump = new URL(href!, "http://app.test").searchParams.get("jump");
  expect(jump).toMatch(/^\d+$/);

  await targetLink.click();
  await expect(page).toHaveURL(new RegExp(`[?&]jump=${jump}(?:&|$)`));
  await expect(page.getByLabel(`第 ${jump} 題題目`)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("status")).toContainText(`已前往第 ${jump} 題`);
});
