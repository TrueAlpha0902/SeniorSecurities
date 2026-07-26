import { expect, type Locator, type Page } from "@playwright/test";

export async function clickGlobalUtility(
  page: Page,
  name: "設定" | "計算機",
): Promise<void> {
  const direct = page.getByRole("button", { name, exact: true });
  for (let index = 0; index < await direct.count(); index += 1) {
    const candidate = direct.nth(index);
    if (await candidate.isVisible()) {
      await candidate.click();
      return;
    }
  }

  const menuButton = page.getByRole("button", { name: "開啟選單" });
  await expect(menuButton).toBeVisible();
  await menuButton.click();

  const menu = page.getByRole("dialog", { name: "功能選單" });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name, exact: true }).click();
}

export async function expectHashTargetInUsefulViewport(
  page: Page,
  target: Locator,
): Promise<void> {
  const metrics = await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const root = document.documentElement;
    const scrollHeight = Math.max(root.scrollHeight, document.body.scrollHeight);
    return {
      top: rect.top,
      bottom: rect.bottom,
      viewportHeight: window.innerHeight,
      scrollY: window.scrollY,
      atDocumentEnd: window.scrollY + window.innerHeight >= scrollHeight - 2,
    };
  });

  expect(metrics.top).toBeGreaterThanOrEqual(0);
  expect(metrics.bottom).toBeGreaterThan(0);
  expect(metrics.top).toBeLessThan(metrics.viewportHeight * 0.65);
  expect(metrics.scrollY > 0 || metrics.atDocumentEnd).toBe(true);
}
