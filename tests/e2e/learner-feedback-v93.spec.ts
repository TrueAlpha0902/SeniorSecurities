import { expect, test } from "@playwright/test";
import { clickGlobalUtility } from "./v93-test-helpers";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("authentication controls expose tabs, password visibility and disabled feedback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("truealpha:v93:e2e-auth-state", "signed-out");
  });
  await page.goto("/auth");

  const loginTab = page.getByRole("tab", { name: "登入" });
  const signupTab = page.getByRole("tab", { name: "註冊" });
  await expect(loginTab).toHaveAttribute("aria-selected", "true");
  await signupTab.click();
  await expect(signupTab).toHaveAttribute("aria-selected", "true");

  const password = page.getByLabel("密碼", { exact: true });
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "顯示密碼" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "隱藏密碼" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await expect(page.getByRole("button", { name: /建立帳號/ })).toBeDisabled();
});

test("calculator announces results and exposes named keyboard controls", async ({ page }) => {
  await page.goto("/");
  await clickGlobalUtility(page, "計算機");

  const dialog = page.getByRole("dialog", { name: /計算機/ });
  await expect(dialog).toBeVisible();
  const input = page.getByLabel("輸入算式或含 x 的方程式");
  await input.fill("1+2");
  await input.press("Enter");
  await expect(page.locator("#floating-calculator-result")).toHaveText("3");

  await expect(page.getByRole("button", { name: "全部清除" })).toBeVisible();
  await expect(page.getByRole("button", { name: "刪除前一個字元" })).toBeVisible();
  await expect(page.getByRole("button", { name: "執行計算" })).toBeVisible();

  const historyToggle = page.getByRole("button", { name: /歷史/ });
  await historyToggle.click();
  await expect(historyToggle).toHaveAttribute("aria-expanded", "true");
});

test("settings use tab semantics and show a focus-trapped destructive confirmation", async ({
  page,
}) => {
  await page.goto("/");
  await clickGlobalUtility(page, "設定");

  const dialog = page.getByRole("dialog", { name: "設定" });
  await expect(dialog).toBeVisible();
  const dataTab = dialog.getByRole("tab", { name: "資料管理" });
  await dataTab.click();
  await expect(dataTab).toHaveAttribute("aria-selected", "true");

  await dialog.getByRole("button", { name: "選擇重設方式" }).click();
  const resetDialog = page.getByRole("dialog", { name: "重設學習資料" });
  await expect(resetDialog).toBeVisible();
  await resetDialog.getByRole("checkbox", { name: /我了解清除後/ }).check();
  await resetDialog.getByRole("button", { name: "確認重設" }).click();
  await expect(page.getByRole("alertdialog", { name: "最後確認" })).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();
  await expect(page.getByRole("alertdialog", { name: "最後確認" })).toHaveCount(0);
});
