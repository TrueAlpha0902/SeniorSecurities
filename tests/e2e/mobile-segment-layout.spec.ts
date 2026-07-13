import { expect, test } from "@playwright/test";

test("reviewed trial crops reflow only below the phone breakpoint", async ({
  page,
}) => {
  await page.goto("/trial");
  const questionStack = page.locator(
    ".image-quiz-card > .pdf-segment-stack",
  );
  await expect(questionStack).toBeVisible();

  await page.getByRole("button", { name: /選擇 \(1\)/ }).click();
  const explanationStack = page.locator(
    ".glass-explanation .pdf-segment-stack",
  );
  await expect(explanationStack).toBeVisible();

  const isPhone = (page.viewportSize()?.width ?? 0) <= 600;
  for (const stack of [questionStack, explanationStack]) {
    if (isPhone) {
      await expect(stack).toHaveClass(/is-fit-to-width/);
      expect(await stack.locator(".pdf-crop-viewport").count()).toBeGreaterThan(1);
      const dimensions = await stack.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(
        dimensions.clientWidth + 1,
      );
      const cropHeights = await stack
        .locator(".pdf-crop-viewport")
        .evaluateAll((elements) =>
          elements.map((element) => element.getBoundingClientRect().height),
        );
      expect(Math.max(...cropHeights)).toBeLessThanOrEqual(45);
      expect(Math.min(...cropHeights)).toBeGreaterThanOrEqual(24);
    } else {
      await expect(stack).not.toHaveClass(/is-fit-to-width/);
      await expect(stack.locator(".pdf-crop-viewport")).toHaveCount(1);
    }
  }

  if (isPhone) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const lastExplanationCrop = explanationStack.locator(".pdf-crop-viewport").last();
    const controls = page.getByRole("navigation", { name: /題目導覽/ });
    const [cropBox, controlsBox] = await Promise.all([
      lastExplanationCrop.boundingBox(),
      controls.boundingBox(),
    ]);
    expect(cropBox).not.toBeNull();
    expect(controlsBox).not.toBeNull();
    expect(cropBox!.y + cropBox!.height).toBeLessThanOrEqual(controlsBox!.y + 1);
  }
});

test("phone keeps the horizontal fallback without reviewed crops", async ({
  page,
}) => {
  test.skip((page.viewportSize()?.width ?? 0) > 600);
  await page.goto("/trial");
  await page.getByLabel("跳到題號").fill("8");
  await page.getByRole("button", { name: "跳轉" }).click();
  const questionStack = page.locator(
    ".image-quiz-card > .pdf-segment-stack",
  );
  await expect(questionStack).toBeVisible();
  await expect(questionStack).not.toHaveClass(/is-fit-to-width/);
  const dimensions = await questionStack.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
  await expect(questionStack).toHaveAttribute("tabindex", "0");
  await expect(questionStack).toHaveAttribute("aria-label", /可左右滑動查看完整內容/);
  await questionStack.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => questionStack.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});

test("phone crop mode follows the exact 600px breakpoint", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto("/trial");
  const questionStack = page.locator(
    ".image-quiz-card > .pdf-segment-stack",
  );
  await expect(questionStack).toHaveClass(/is-fit-to-width/);

  await page.setViewportSize({ width: 601, height: 900 });
  await expect(questionStack).not.toHaveClass(/is-fit-to-width/);

  await page.setViewportSize({ width: 600, height: 900 });
  await expect(questionStack).toHaveClass(/is-fit-to-width/);
});
