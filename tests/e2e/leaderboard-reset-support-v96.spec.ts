import { expect, test } from "@playwright/test";

test("leaderboard categories drive the podium and full ranking from one selector", async ({ page }) => {
  await page.goto("/leaderboard");

  await expect(page.getByRole("heading", { level: 1, name: "排行榜" })).toBeVisible();
  await expect(page.getByText("學習榮耀榜", { exact: true })).toHaveCount(0);

  const tabs = page.getByRole("tablist", { name: "排行榜類型" });
  const streak = tabs.getByRole("tab", { name: "連續答對" });
  const time = tabs.getByRole("tab", { name: "練習時數" });
  const mastery = tabs.getByRole("tab", { name: "刷題大師" });

  await expect(streak).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { level: 2, name: "連續答對排行" })).toBeVisible();
  await expect(page.getByText("目前依「連續答對」顯示前三名。")).toBeVisible();

  await time.click();
  await expect(time).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { level: 2, name: "累積練習時數排行" })).toBeVisible();
  await expect(page.getByText("目前依「練習時數」顯示前三名。")).toBeVisible();

  await mastery.click();
  await expect(mastery).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { level: 2, name: "不重複刷題排行" })).toBeVisible();
  await expect(page.getByText("目前依「刷題大師」顯示前三名。")).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("registration and activation help expose the exact support address", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("truealpha:v93:e2e-auth-state", "signed-out");
  });
  await page.goto("/auth");

  const supportLink = page.getByRole("link", { name: "aaron.kcts@gmail.com" });
  await expect(supportLink).toBeVisible();
  await expect(supportLink).toHaveAttribute(
    "href",
    "mailto:aaron.kcts@gmail.com?subject=%E5%95%9F%E7%94%A8%E7%A2%BC%E5%8D%94%E5%8A%A9",
  );

  await page.getByRole("button", { name: "註冊", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "建立會員帳號" })).toBeVisible();
  await expect(supportLink).toBeVisible();
  await expect(page.getByText("請勿寄送密碼或完整啟用碼。", { exact: false })).toBeVisible();
});
