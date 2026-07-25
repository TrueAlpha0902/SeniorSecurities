import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectDarkReadablePage(page: Page) {
  const result = await page.locator("body").evaluate((element) => {
    const style = window.getComputedStyle(element);
    const parse = (value: string) =>
      value.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [];
    return {
      background: parse(style.backgroundColor),
      foreground: parse(style.color),
    };
  });

  expect(result.background).toHaveLength(3);
  expect(result.foreground).toHaveLength(3);
  expect(Math.max(...result.background)).toBeLessThan(40);
  expect(Math.min(...result.foreground)).toBeGreaterThan(200);
}

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

const majorRoutes = [
  { path: "/", heading: "選擇題庫" },
  { path: "/securities", heading: "證券高業" },
  { path: "/foreign-exchange", heading: "初階外匯" },
  { path: "/banks/investment", heading: "投資學" },
  { path: "/random", heading: "模擬考" },
  { path: "/similar", selector: ".similar-learning-page, .state-card" },
  { path: "/leaderboard", heading: "學習榮耀榜" },
  { path: "/search", heading: "搜尋題目" },
  { path: "/account", heading: "我的帳號" },
  { path: "/activate", heading: /啟用證券高業/ },
  { path: "/trial", selector: ".image-quiz-page" },
] as const;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
});

test("major learner interfaces render on the dark system without page crashes", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  for (const route of majorRoutes) {
    await test.step(route.path, async () => {
      await page.goto(route.path);
      await expect(page.locator("#root")).not.toBeEmpty();
      if ("heading" in route) {
        await expect(page.getByRole("heading", { name: route.heading }).first()).toBeVisible({
          timeout: 20_000,
        });
      } else {
        await expect(page.locator(route.selector).first()).toBeVisible({ timeout: 20_000 });
      }
      await expect(page.locator(".theme-v93")).toBeVisible();
      await expectDarkReadablePage(page);
    });
  }

  expect(pageErrors, pageErrors.join("\n")).toEqual([]);

  if (testInfo.project.name === "desktop") {
    await page.goto("/search");
    await expectNoSeriousAccessibilityViolations(page);
  }
});

test("desktop exam navigation routes, scrolls and opens utility dialogs", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop sidebar only");
  await page.goto("/securities");

  const examNavigation = page.locator(".v90-sidebar-nav");
  await examNavigation.getByRole("button", { name: "題庫練習" }).click();
  await expect(page).toHaveURL(/\/securities#learning-path$/);
  await expect(page.locator("#learning-path")).toBeFocused();

  await examNavigation.getByRole("button", { name: "模擬考" }).click();
  await expect(page).toHaveURL(/\/random$/);
  await expect(page.getByRole("heading", { name: "模擬考", exact: true })).toBeVisible();

  await page.goto("/securities");
  const utilities = page.locator(".v90-sidebar-utilities");
  await utilities.getByRole("button", { name: "搜尋題目" }).click();
  await expect(page).toHaveURL(/\/search$/);

  await page.goto("/securities");
  await page.locator(".v90-sidebar-utilities").getByRole("button", { name: "計算機" }).click();
  await expect(page.getByRole("dialog", { name: /計算機/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /計算機/ })).toHaveCount(0);

  await page.getByRole("button", { name: "設定" }).click();
  await expect(page.getByRole("dialog", { name: "設定" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "設定" })).toHaveCount(0);
});

test("foreign-exchange navigation reaches practice, wrong and favorite modes", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop sidebar only");
  await page.goto("/foreign-exchange");

  const navigation = page.locator(".v90-sidebar-nav");
  await navigation.getByRole("button", { name: "題庫練習" }).click();
  await expect(page).toHaveURL(/\/foreign-exchange#learning-path$/);
  await expect(page.locator("#learning-path")).toBeFocused();

  await navigation.getByRole("button", { name: "模擬考" }).click();
  await expect(page).toHaveURL(/\/foreign-exchange#fx-history$/);
  await expect(page.locator("#fx-history")).toBeFocused();

  await navigation.getByRole("button", { name: "我的錯題" }).click();
  await expect(page).toHaveURL(/\/foreign-exchange\/practice\?mode=wrong$/);

  await page.goto("/foreign-exchange");
  await page.locator(".v90-sidebar-nav").getByRole("button", { name: "收藏夾" }).click();
  await expect(page).toHaveURL(/\/foreign-exchange\/practice\?mode=favorites$/);
});

test("mobile navigation exposes named controls and immediate feedback", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile navigation only");
  await page.goto("/securities");

  await expect(page.getByRole("button", { name: "前往證券高業首頁" })).toBeVisible();
  const bottomNavigation = page.locator(".v90-mobile-bottom-nav");
  await expect(bottomNavigation).toBeVisible();
  await bottomNavigation.getByRole("button", { name: "題庫練習" }).click();
  await expect(page).toHaveURL(/\/securities#learning-path$/);

  await page.goto("/securities");
  await page.getByRole("button", { name: "開啟選單" }).click();
  const menu = page.getByRole("dialog", { name: "功能選單" });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "計算機" }).click();
  await expect(page.getByRole("dialog", { name: /計算機/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /計算機/ })).toHaveCount(0);
});

test("unknown routes recover to the catalog instead of producing a dead page", async ({
  page,
}) => {
  await page.goto("/__v93_unknown_route__");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "選擇題庫" })).toBeVisible();
  await expect(page.locator("#root")).not.toBeEmpty();
});
