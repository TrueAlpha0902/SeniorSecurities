import { expect, test, type Page } from "@playwright/test";

const E2E_USER_ID = "00000000-0000-4000-8000-000000000079";

function fakeJwt(): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    aud: "authenticated",
    exp: 4_102_444_800,
    role: "authenticated",
    sub: E2E_USER_ID,
  })}.e2e-signature`;
}

async function configureActivatedE2eUser(page: Page): Promise<void> {
  const now = new Date().toISOString();
  const user = {
    id: E2E_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "mock-exam-e2e@example.invalid",
    email_confirmed_at: now,
    phone: "",
    confirmed_at: now,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  };
  const session = {
    access_token: fakeJwt(),
    token_type: "bearer",
    expires_in: 2_147_483_647,
    expires_at: 4_102_444_800,
    refresh_token: "e2e-refresh-token",
    user,
  };

  await page.addInitScript(
    ({ storedSession }) => {
      window.localStorage.setItem(
        "sb-e2e-auth-token",
        JSON.stringify(storedSession),
      );
    },
    { storedSession: session },
  );

  await page.route("https://e2e.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = {
      "access-control-allow-origin": "*",
      "content-type": "application/json",
    };

    if (url.pathname.includes("/rest/v1/user_entitlements")) {
      await route.fulfill({
        status: 200,
        headers: { ...headers, "content-range": "0-0/1" },
        body: JSON.stringify([
          {
            plan: "e2e",
            status: "active",
            granted_at: now,
            expires_at: null,
          },
        ]),
      });
      return;
    }
    if (url.pathname === "/auth/v1/user") {
      await route.fulfill({ status: 200, headers, body: JSON.stringify(user) });
      return;
    }
    if (url.pathname.includes("/rest/v1/rpc/")) {
      await route.fulfill({ status: 200, headers, body: "null" });
      return;
    }
    if (request.method() === "GET" || request.method() === "HEAD") {
      await route.fulfill({
        status: 200,
        headers: { ...headers, "content-range": "*/0" },
        body: request.method() === "HEAD" ? "" : "[]",
      });
      return;
    }
    await route.fulfill({ status: 201, headers, body: "[]" });
  });
}

async function setDeferredFeedback(page: Page, enabled: boolean) {
  const feedbackCard = page
    .locator(".mock-setting-card-v797")
    .filter({ hasText: "交卷後統一批改" });
  const checkbox = feedbackCard.locator('input[type="checkbox"]');
  await expect(checkbox).toBeVisible();
  if ((await checkbox.isChecked()) !== enabled) {
    await checkbox.setChecked(enabled, { force: true });
  }
  await expect(checkbox).toBeChecked({ checked: enabled });
}

async function startOneQuestionExam(page: Page) {
  const countInput = page.locator('input[type="number"]').first();
  await countInput.fill("1");
  await page.locator(".random-start-button").first().click();
  await expect(page).toHaveURL(/\/image-quiz\/random\//);
  await expect(page.locator(".glass-answer-button")).toHaveCount(4, {
    timeout: 20_000,
  });
}

async function saveAndLeaveExam(page: Page) {
  await page.locator('.nav-icon-button[aria-label="首頁"]').click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/random");
  await expect(page.getByRole("heading", { name: "模擬考", exact: true })).toBeVisible();
}

test("mock exam resumes, permits revisions, and honors both feedback modes", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "The focused interaction flow runs once; responsive projects cover shared quiz layout.",
  );
  test.setTimeout(90_000);
  await configureActivatedE2eUser(page);
  page.on("dialog", async (dialog) => dialog.accept());

  await page.goto("/random");
  await expect(page.getByRole("heading", { name: "模擬考", exact: true })).toBeVisible({
    timeout: 20_000,
  });

  await setDeferredFeedback(page, false);
  await startOneQuestionExam(page);
  const immediateOptions = page.locator(".glass-answer-button");
  await immediateOptions.nth(0).click();
  await expect(page.locator(".image-answer-panel")).toBeVisible();
  await expect(immediateOptions.nth(1)).toBeEnabled();
  await immediateOptions.nth(1).click();
  await expect(immediateOptions.nth(1)).toHaveAttribute("aria-pressed", "true");

  await saveAndLeaveExam(page);
  const immediateContinue = page.getByRole("link", { name: "繼續測驗" });
  await expect(immediateContinue).toBeVisible();
  await immediateContinue.click();
  await expect(page.locator(".glass-answer-button").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page
    .locator(".image-quiz-controls")
    .getByRole("button", { name: "完成" })
    .click();
  await expect(page.getByRole("heading", { name: "練習完成" })).toBeVisible();

  await page.getByRole("button", { name: /重新練習/ }).click();
  await expect(page).toHaveURL(/\/random$/);
  await setDeferredFeedback(page, true);
  await startOneQuestionExam(page);
  const deferredOptions = page.locator(".glass-answer-button");
  await deferredOptions.nth(0).click();
  await expect(page.locator(".image-answer-panel")).toHaveCount(0);
  await expect(deferredOptions.nth(1)).toBeEnabled();
  await deferredOptions.nth(1).click();
  await expect(deferredOptions.nth(1)).toHaveAttribute("aria-pressed", "true");

  await saveAndLeaveExam(page);
  const deferredContinue = page.getByRole("link", { name: "繼續測驗" });
  const pendingCard = deferredContinue.locator("xpath=ancestor::article");
  await expect(pendingCard.locator(".record-metrics")).toContainText("—");
  await deferredContinue.click();
  await expect(page.locator(".image-answer-panel")).toHaveCount(0);
  await expect(page.locator(".glass-answer-button").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page
    .locator(".image-quiz-controls")
    .getByRole("button", { name: "交卷" })
    .click();
  await expect(page.getByRole("heading", { name: "練習完成" })).toBeVisible();
  await expect(page.locator(".glass-answer-button")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: "練習完成" })).toBeVisible();
  await expect(page.locator(".glass-answer-button")).toHaveCount(0);
});
