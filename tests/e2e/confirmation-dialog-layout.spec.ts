import { expect, test } from "@playwright/test";

test("portaled confirmation dialogs cover the viewport and remain in view", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const backdrop = document.createElement("div");
    backdrop.className = "theme-v93 theme-v90 v93-confirm-backdrop";
    backdrop.dataset.v93ConfirmDialog = "true";

    const dialog = document.createElement("section");
    dialog.className = "v93-confirm-dialog is-primary";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-label", "開通證券高業權限");
    dialog.innerHTML = [
      "<header>",
      '<span class="v93-confirm-icon" aria-hidden="true"></span>',
      "<div><h2>開通證券高業權限</h2><div>確認題庫權限操作。</div></div>",
      '<button type="button" aria-label="關閉確認視窗"></button>',
      "</header>",
      '<footer><button type="button" class="glass-button">取消</button>',
      '<button type="button" class="glass-button glass-button-primary">確認執行</button></footer>',
    ].join("");
    backdrop.append(dialog);
    document.body.append(backdrop);
  });

  const backdrop = page.locator('[data-v93-confirm-dialog="true"]');
  const dialog = page.getByRole("alertdialog", { name: "開通證券高業權限" });
  await expect(backdrop).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "確認執行" })).toBeInViewport();

  const layout = await backdrop.evaluate((element) => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return {
      parentIsBody: element.parentElement === document.body,
      position: style.position,
      zIndex: Number(style.zIndex),
      bounds: {
        top: Math.round(bounds.top),
        left: Math.round(bounds.left),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    };
  });

  expect(layout.parentIsBody).toBe(true);
  expect(layout.position).toBe("fixed");
  expect(layout.zIndex).toBeGreaterThan(100);
  expect(layout.bounds).toEqual({
    top: 0,
    left: 0,
    width: layout.viewport.width,
    height: layout.viewport.height,
  });
});

test("the shared production confirmation component stays visible and cancelable", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The real shared component smoke runs once.");
  test.setTimeout(90_000);

  await page.goto("/random");
  await expect(page.getByRole("heading", { name: "模擬考", exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await page.locator('input[type="number"]').first().fill("1");
  await page.locator(".random-start-button").first().click();

  const options = page.locator(".glass-answer-button");
  await expect(options).toHaveCount(4, { timeout: 20_000 });
  await options.first().click();
  await page.getByRole("button", { name: "交卷" }).click();

  const backdrop = page.locator('[data-v93-confirm-dialog="true"]');
  const dialog = page.getByRole("alertdialog", { name: "確認交卷" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "確認交卷" })).toBeInViewport();
  await expect(backdrop).toHaveCSS("position", "fixed");
  expect(await backdrop.evaluate((element) => element.parentElement === document.body)).toBe(true);

  await dialog.getByRole("button", { name: "返回檢查" }).click();
  await expect(dialog).toHaveCount(0);
});
