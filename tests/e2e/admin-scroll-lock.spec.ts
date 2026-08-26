import { expect, test } from "@playwright/test";

test("nested admin overlays restore body scrolling after the final overlay closes", async ({ page }) => {
  await page.goto("/");

  const states = await page.evaluate(async (modulePath) => {
    const { acquireBodyScrollLock } = await import(modulePath) as {
      acquireBodyScrollLock: () => () => void;
    };
    document.body.style.overflow = "auto";
    document.body.style.minHeight = "4000px";

    const releaseDrawer = acquireBodyScrollLock();
    const afterDrawerOpen = document.body.style.overflow;
    const releaseConfirmation = acquireBodyScrollLock();
    const afterConfirmationOpen = document.body.style.overflow;

    releaseConfirmation();
    const afterConfirmationClose = document.body.style.overflow;
    releaseDrawer();
    const afterDrawerClose = document.body.style.overflow;

    return {
      afterDrawerOpen,
      afterConfirmationOpen,
      afterConfirmationClose,
      afterDrawerClose,
    };
  }, "/src/hooks/useBodyScrollLock.ts");

  expect(states).toEqual({
    afterDrawerOpen: "hidden",
    afterConfirmationOpen: "hidden",
    afterConfirmationClose: "hidden",
    afterDrawerClose: "auto",
  });

  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});
