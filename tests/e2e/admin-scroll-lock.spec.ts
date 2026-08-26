import { expect, test, type Page } from "@playwright/test";

const ADMIN_ID = "00000000-0000-4000-8000-000000000099";
const MEMBER_ID = "00000000-0000-4000-8000-000000000001";
const HIGH_CODE_ID = "00000000-0000-4000-8000-000000000011";
const FX_CODE_ID = "00000000-0000-4000-8000-000000000012";
const MEMBER_EMAIL = "drawer.member@example.test";

const highCodeMembership = {
  id: HIGH_CODE_ID,
  examId: "senior-securities",
  codePreview: "SENIOR••••A001",
  note: "高業測試班",
  maxUses: 50,
  useCount: 1,
  historyGap: 0,
  isActive: true,
  redeemedAt: "2026-08-01T08:05:00.000Z",
  source: "redeem",
};

const fxCodeMembership = {
  id: FX_CODE_ID,
  examId: "junior-foreign-exchange",
  codePreview: "FOREX••••B002",
  note: "外匯測試班",
  maxUses: 25,
  useCount: 1,
  historyGap: 0,
  isActive: true,
  redeemedAt: "2026-08-02T08:05:00.000Z",
  source: "redeem",
};

const memberRow = {
  id: MEMBER_ID,
  email: MEMBER_EMAIL,
  createdAt: "2026-08-01T08:00:00.000Z",
  lastSignInAt: "2026-08-26T06:00:00.000Z",
  entitlements: [
    {
      examId: "senior-securities",
      plan: "full",
      status: "active",
      grantedAt: "2026-08-01T08:05:00.000Z",
      expiresAt: null,
      activationCode: {
        id: HIGH_CODE_ID,
        code_preview: highCodeMembership.codePreview,
        max_uses: highCodeMembership.maxUses,
        use_count: highCodeMembership.useCount,
        redemption_history_gap: 0,
        is_active: true,
        note: highCodeMembership.note,
        redeemed_at: highCodeMembership.redeemedAt,
      },
    },
    {
      examId: "junior-foreign-exchange",
      plan: "full",
      status: "active",
      grantedAt: "2026-08-02T08:05:00.000Z",
      expiresAt: null,
      activationCode: {
        id: FX_CODE_ID,
        code_preview: fxCodeMembership.codePreview,
        max_uses: fxCodeMembership.maxUses,
        use_count: fxCodeMembership.useCount,
        redemption_history_gap: 0,
        is_active: true,
        note: fxCodeMembership.note,
        redeemed_at: fxCodeMembership.redeemedAt,
      },
    },
  ],
  activationCodes: [highCodeMembership, fxCodeMembership],
  entitlementStatus: "active",
  plan: "full",
  grantedAt: "2026-08-01T08:05:00.000Z",
  expiresAt: null,
  activationCode: null,
  lastEventAt: "2026-08-26T06:00:00.000Z",
  lastEventType: "sign_in",
  lastIp: "192.0.2.10",
  loginEventCount: 1,
  practicedQuestionCount: 12,
  totalPracticeSeconds: 900,
  totalAnswered: 12,
  totalCorrect: 9,
  currentCorrectStreak: 2,
  bestCorrectStreak: 4,
  isOnline: false,
  lastSeenAt: "2026-08-26T06:00:00.000Z",
  lastActivityAt: "2026-08-26T06:00:00.000Z",
};

const memberDetail = {
  user: {
    id: MEMBER_ID,
    email: MEMBER_EMAIL,
    createdAt: "2026-08-01T08:00:00.000Z",
    lastSignInAt: "2026-08-26T06:00:00.000Z",
    emailConfirmedAt: "2026-08-01T08:02:00.000Z",
    phone: null,
    lastSeenAt: "2026-08-26T06:00:00.000Z",
    lastActivityAt: "2026-08-26T06:00:00.000Z",
    isOnline: false,
  },
  entitlements: memberRow.entitlements,
  entitlement: memberRow.entitlements[0],
  activationCodes: memberRow.activationCodes,
  learning: {
    totalAnswered: 12,
    totalCorrect: 9,
    accuracy: 75,
    currentCorrectStreak: 2,
    bestCorrectStreak: 4,
    totalPracticeSeconds: 900,
    practicedQuestionCount: 12,
    wrongQuestionCount: 3,
    favoriteQuestionCount: 1,
  },
  loginEvents: [],
  devices: [],
  recentAnswers: [],
  recentSessions: [],
};

async function mockAdminPage(page: Page, users: () => typeof memberRow[]) {
  await page.route("**/src/auth/AuthContext.tsx*", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        const user = {
          id: "${ADMIN_ID}",
          email: "admin@example.test",
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: {},
        };
        const access = { hasEntitlement: true, plan: "preview", redeemedAt: null, error: null };
        export function AuthProvider({ children }) { return children; }
        export function useAuth() {
          return {
            session: { access_token: "e2e-admin-token", user },
            user,
            loading: false,
            isConfigured: true,
            examAccess: {
              "senior-securities": access,
              "junior-foreign-exchange": access,
            },
            access,
            isActivated: true,
            getExamAccess: () => access,
            hasExamAccess: () => true,
            refreshAccess: async () => {},
            signIn: async () => {},
            signUp: async () => null,
            signOut: async () => {},
            redeemActivationCode: async () => {},
            requestPasswordReset: async () => {},
            updatePassword: async () => {},
          };
        }
      `,
    });
  });

  await page.route("**/src/lib/supabase.ts*", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        export const isSupabaseConfigured = false;
        export const supabase = null;
      `,
    });
  });

  await page.route("**/api/admin/users?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        users: users(),
        admin: { role: "primary_admin" },
        pagination: { page: 1, perPage: 50, hasMore: false },
      }),
    });
  });

  await page.route("**/api/admin/user-detail?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(memberDetail),
    });
  });
}

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

test("member drawer releases body scrolling after close and after the selected member disappears on refresh", async ({ page }) => {
  let memberIsVisible = true;
  let usersRequestCount = 0;
  await mockAdminPage(page, () => {
    usersRequestCount += 1;
    return memberIsVisible ? [memberRow] : [];
  });

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "使用者與活動" })).toBeVisible();
  await page.evaluate(() => {
    document.body.style.minHeight = "3000px";
    document.body.style.overflow = "auto";
  });

  const memberButton = page.getByRole("button", { name: `查看 ${MEMBER_EMAIL} 的活動資料` });
  await memberButton.click();
  await expect(page.getByRole("dialog", { name: MEMBER_EMAIL })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");

  await page.getByRole("button", { name: "關閉使用者詳情" }).click();
  await expect(page.getByRole("dialog", { name: MEMBER_EMAIL })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("auto");
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  await page.evaluate(() => window.scrollTo(0, 0));
  await memberButton.click();
  await expect(page.getByRole("dialog", { name: MEMBER_EMAIL })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");

  memberIsVisible = false;
  const requestsBeforeRefresh = usersRequestCount;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => usersRequestCount).toBeGreaterThan(requestsBeforeRefresh);
  await expect(page.getByRole("dialog", { name: MEMBER_EMAIL })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("auto");
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test("activation-code groups keep exam memberships separate and expose the primary-admin delete dialog", async ({ page }) => {
  let adminMutationCalls = 0;
  await mockAdminPage(page, () => [memberRow]);
  await page.route("**/api/admin/action", async (route) => {
    adminMutationCalls += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "E2E regression must not submit mutations." }),
    });
  });

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "使用者與活動" })).toBeVisible();
  await page.getByRole("button", { name: "依啟用碼" }).click();

  const highGroup = page.locator(".admin-activation-group").filter({
    has: page.getByRole("heading", { name: highCodeMembership.note }),
  });
  await expect(highGroup).toContainText("證券高業");
  await expect(highGroup).toContainText(highCodeMembership.codePreview);
  await expect(highGroup.getByRole("button", { name: `查看 ${MEMBER_EMAIL} 的會員明細` })).toBeVisible();

  const fxGroup = page.locator(".admin-activation-group").filter({
    has: page.getByRole("heading", { name: fxCodeMembership.note }),
  });
  await expect(fxGroup).toContainText("初階外匯");
  await expect(fxGroup).toContainText(fxCodeMembership.codePreview);
  await expect(fxGroup.getByRole("button", { name: `查看 ${MEMBER_EMAIL} 的會員明細` })).toBeVisible();

  await highGroup.getByRole("button", { name: `查看 ${MEMBER_EMAIL} 的會員明細` }).click();
  await expect(page.getByRole("dialog", { name: MEMBER_EMAIL })).toBeVisible();
  const deleteEntry = page.getByRole("button", { name: "永久移除帳號", exact: true });
  await expect(deleteEntry).toBeVisible();
  await deleteEntry.click();

  const deleteDialog = page.getByRole("alertdialog", { name: "永久移除會員帳號" });
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog).toContainText(MEMBER_EMAIL);
  await expect(deleteDialog).toContainText("目前無法連線至身分驗證服務");
  await expect(page.getByRole("button", { name: "永久刪除會員", exact: true })).toBeDisabled();
  expect(adminMutationCalls).toBe(0);

  await page.getByRole("button", { name: "關閉永久刪除視窗" }).click();
  await expect(deleteDialog).toHaveCount(0);
  expect(adminMutationCalls).toBe(0);
});
