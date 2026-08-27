import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  isForeignExchangeAnswerCorrect,
  type ForeignExchangeQuestion,
} from "../src/lib/foreignExchange";

const root = process.cwd();

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(root, relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function exists(relativePath: string): Promise<boolean> {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function publicApiRoutes(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const routes: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    const absolute = path.join(directory, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) routes.push(...await publicApiRoutes(absolute, relative));
    else if (entry.isFile() && /\.(?:[cm]?[jt]s)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) routes.push(relative);
  }
  return routes.sort();
}

const [
  app,
  auth,
  protectedRoute,
  questionApi,
  foreignExchangeLib,
  progress,
  catalog,
  home,
  practice,
  account,
  adminPage,
  adminTools,
  adminAction,
  adminUsers,
  adminDetail,
  migration,
  migrationV97,
  clientError,
  vercel,
] = await Promise.all([
  read("src/App.tsx"),
  read("src/auth/AuthContext.tsx"),
  read("src/auth/ProtectedRoute.tsx"),
  read("api/questions.ts"),
  read("src/lib/foreignExchange.ts"),
  read("src/lib/foreignExchangeProgress.ts"),
  read("src/pages/ExamCatalogPage.tsx"),
  read("src/pages/ForeignExchangeHomePage.tsx"),
  read("src/pages/ForeignExchangePracticePage.tsx"),
  read("src/pages/AccountPage.tsx"),
  read("src/pages/AdminPage.tsx"),
  read("src/components/AdminToolsPanel.tsx"),
  read("api/admin/action.ts"),
  read("api/admin/users.ts"),
  read("api/admin/user-detail.ts"),
  read("supabase/migrations/20260719120000_exam_scoped_entitlements_v80.sql"),
  read("supabase/migrations/20260828090000_admin_password_activation_management_v97.sql"),
  read("api/client-error.ts"),
  read("vercel.json"),
]);

assert(app.includes('examId="senior-securities"') && app.includes('examId="junior-foreign-exchange"'), "Each question bank must have its own protected route scope.");
assert(app.includes('path="/foreign-exchange"') && app.includes('path="/foreign-exchange/practice"'), "Foreign-exchange routes are missing.");
assert(auth.includes('EXAM_IDS = ["senior-securities", "junior-foreign-exchange"]'), "Auth must load both entitlement scopes.");
assert(auth.includes('.from("user_exam_entitlements")'), "Auth must read exam-scoped entitlements.");
assert(protectedRoute.includes("getExamAccess(examId)"), "Route protection must evaluate the requested exam entitlement.");

assert(questionApi.includes('type Resource = "securities" | "foreign-exchange" | "overrides"'), "Question content must use the unified protected API.");
assert(questionApi.includes("requireAuthenticatedUser(req)"), "Question data API must authenticate the user.");
assert(questionApi.includes('.from("user_exam_entitlements")') && questionApi.includes('.eq("exam_id", examId)'), "Question API must enforce the requested exam entitlement.");
assert(questionApi.includes('req.method !== "GET" && req.method !== "POST"'), "Question API must support both compact GET and filtered POST requests.");
assert(questionApi.includes("const MAX_IDS = 3_526") && questionApi.includes("const MAX_RANDOM_COUNT = 300"), "Unified API request limits must be bounded and cover both archives.");
assert(questionApi.includes("session >= 23 && session <= 47"), "Question API must accept sessions 23 through 47.");
assert(questionApi.includes("randomize(matches).slice(0, randomCount)"), "Random practice must be sampled server-side.");

const fxClientProjection = questionApi.slice(
  questionApi.indexOf("function toFxClientQuestion"),
  questionApi.indexOf("function toFxMockQuestion"),
);
for (const requiredField of ["acceptedAnswers", "allAnsweredCredit", "automaticCredit", "answerNote", "explanation"]) {
  assert(fxClientProjection.includes(requiredField), `${requiredField} must be returned after grading or in practice mode.`);
}
for (const internalField of ["sourceFile", "sourcePage", "sourceTextSha256", "sourcePdfSha256", "reviewStatus", "explanationKind"]) {
  assert(!fxClientProjection.includes(internalField), `${internalField} must not be returned to learners.`);
}
const fxMockProjection = questionApi.slice(
  questionApi.indexOf("function toFxMockQuestion"),
  questionApi.indexOf("function fxAnswerCorrect"),
);
for (const hiddenField of ["answer:", "acceptedAnswers", "allAnsweredCredit", "automaticCredit", "answerNote", "explanation:"]) {
  assert(!fxMockProjection.includes(hiddenField), `Pre-submit foreign-exchange mock payload must hide ${hiddenField}.`);
}
assert(questionApi.includes('action === "mock-start"') && questionApi.includes('action === "mock-resume"') && questionApi.includes('action === "mock-submit"'), "Unified API must implement the complete mock lifecycle.");
assert(questionApi.includes("createHmac") && questionApi.includes("timingSafeEqual") && questionApi.includes("verifyMockToken"), "Mock sessions must use signed, verified tokens.");

assert(foreignExchangeLib.includes("FOREIGN_EXCHANGE_MIN_SESSION = 23") && foreignExchangeLib.includes("FOREIGN_EXCHANGE_MAX_SESSION = 47"), "Frontend session range must be 23 through 47.");
assert(foreignExchangeLib.includes("FOREIGN_EXCHANGE_TOTAL_QUESTIONS = 3_250"), "Frontend total must be 3,250.");
assert(foreignExchangeLib.includes("isForeignExchangeAnswerCorrect") && foreignExchangeLib.includes("acceptedForeignExchangeAnswers"), "Official multi-answer scoring helpers are missing.");
assert(foreignExchangeLib.includes("if (question.automaticCredit) return true"), "Automatic-credit questions must score even when left unanswered after submission.");
assert(
  foreignExchangeLib.includes("requestQuestionBankJson")
    && foreignExchangeLib.includes('url: "/api/questions"'),
  "Frontend must use the unified question endpoint through the shared authenticated client.",
);
assert(foreignExchangeLib.includes("startForeignExchangeMock") && foreignExchangeLib.includes("resumeForeignExchangeMock") && foreignExchangeLib.includes("submitForeignExchangeMock"), "Frontend mock lifecycle helpers are incomplete.");
assert(progress.includes("FOREIGN_EXCHANGE_QUESTION_ID_PATTERN") && progress.includes("isCorrect?: boolean"), "Progress must accept sessions 23-47 and persist official scoring results.");

assert(practice.includes("startForeignExchangeMock") && practice.includes("resumeForeignExchangeMock") && practice.includes("submitForeignExchangeMock"), "Practice page must use server-controlled mock grading.");
assert(practice.includes("mockToken") && practice.includes('version: 2'), "Resumable mock snapshots must persist a signed token.");
assert(practice.includes("submitted || (!isMock && (selectedAnswer || answerModeAllowed))"), "Mock answers and explanations must remain hidden until submission while practice answer mode stays supported.");
assert(practice.includes("currentQuestion.explanation") && practice.includes("V93AnswerBadge") && !practice.includes("foreignExchangeAnswerText(currentQuestion)"), "Revealed results must show explanation and native option-led official answer feedback without a duplicate answer line.");
assert(practice.includes("randomCount: mode === \"random\" ? requestedCount : undefined"), "Random mode must not download all 3,250 questions.");
assert(practice.includes("isMock && !submitted") && practice.includes("<span>未作答</span>"), "Mock side statistics must not expose correct/wrong counts before submission.");
for (const removedCopy of ["PDF頁碼", "SHA-256", "OCR", "AI生成"]) {
  assert(!practice.includes(removedCopy), `Learner UI must not show unnecessary note: ${removedCopy}`);
}

assert(
  !catalog.includes("Exam Library") &&
    catalog.includes("EXAM_QUESTION_COUNTS") &&
    catalog.includes("第23至47屆") &&
    catalog.includes("2考科／25屆"),
  "Catalog must show the complete foreign-exchange archive without duplicate English copy.",
);
assert(home.includes("第23至47屆") && home.includes("3,250題") && !home.includes("Junior Foreign Exchange"), "Foreign-exchange home archive count is missing or duplicate English copy returned.");
assert(account.includes("證券高業") && account.includes("初階外匯") && account.includes("examAccess"), "Account page must show each question-bank entitlement separately.");

assert(!adminTools.includes("create_activation_code_v80"), "Client must call the admin API rather than a database RPC directly.");
assert(
  adminTools.includes('value="junior-foreign-exchange"')
    && adminTools.includes('value="senior-securities"')
    && adminTools.includes('value="all"'),
  "Activation-code admin UI must support either individual question bank or all question banks.",
);
assert(adminAction.includes("normalizeExamId(body.examId)") && adminAction.includes('.eq("exam_id", examId)'), "Admin entitlement actions must be scoped to one question bank.");
assert(adminPage.includes("EXAM_IDS.map") && adminPage.includes("examId }),"), "Admin member controls must send an explicit question-bank scope.");
assert(adminUsers.includes("entitlements") && adminDetail.includes("entitlements: normalizedEntitlements"), "Admin APIs must return both entitlement states.");

assert(migration.includes("create table if not exists public.user_exam_entitlements"), "Exam-scoped entitlement table migration is missing.");
assert(migration.includes("primary key (user_id, exam_id)"), "Each user/question-bank entitlement must be independently keyed.");
assert(migration.includes("create_activation_code_v80") && migration.includes("code_record.exam_id"), "Activation redemption must grant the code's own question bank.");
assert(
  migrationV97.includes("code_record.exam_id = 'all'")
    && migrationV97.includes("array['senior-securities', 'junior-foreign-exchange']")
    && migrationV97.includes("activation_code_redemptions"),
  "All-question-bank activation must consume one redemption while granting both question banks.",
);

assert(!await exists("api/foreign-exchange/questions.ts"), "Legacy foreign-exchange route must be consolidated.");
assert(!await exists("api/question-overrides.ts"), "Legacy override route must be consolidated.");
assert(!await exists("api/auth/log-login.ts"), "Login audit must be consolidated.");
assert(clientError.includes("handleLoginAudit") && clientError.includes('event === "login-audit"'), "Consolidated login-audit handler is missing.");
assert(vercel.includes('"source": "/api/foreign-exchange/questions"') && vercel.includes('"destination": "/api/questions?resource=foreign-exchange"'), "Foreign-exchange compatibility rewrite is missing.");
assert(vercel.includes('"source": "/api/question-overrides"') && vercel.includes('"destination": "/api/questions?resource=overrides"'), "Override compatibility rewrite is missing.");
assert(vercel.includes('"source": "/api/auth/log-login"') && vercel.includes('"destination": "/api/client-error?event=login-audit"'), "Login-audit rewrite is missing.");
assert(!await exists("api/admin/ping.ts"), "Admin health must be consolidated instead of consuming a separate Vercel function.");
assert(adminAction.includes("handleHealthCheck") && adminAction.includes('req.method === "GET"'), "Consolidated admin health handler is missing.");
assert(vercel.includes('"source": "/api/admin/ping"') && vercel.includes('"destination": "/api/admin/action?operation=health"'), "Admin health compatibility rewrite is missing.");

const routes = await publicApiRoutes(path.join(root, "api"));
assert(routes.length <= 9, `v83 must retain at least three Vercel Hobby function slots; found ${routes.length}: ${routes.join(", ")}`);

const session38 = JSON.parse(await read("api/_data/foreign-exchange/38-remittance.json")) as ForeignExchangeQuestion[];
const session31 = JSON.parse(await read("api/_data/foreign-exchange/31-trade.json")) as ForeignExchangeQuestion[];
const automaticCreditQuestion = session38[0];
const answeredOnlyQuestion = session31[68];
assert(automaticCreditQuestion?.id === "fx-38-remittance-001" && automaticCreditQuestion.automaticCredit, "Session 38 question 1 must use automatic credit.");
assert(isForeignExchangeAnswerCorrect(automaticCreditQuestion, undefined), "Automatic credit must score an unanswered question as correct after grading.");
assert(answeredOnlyQuestion?.id === "fx-31-trade-069" && answeredOnlyQuestion.allAnsweredCredit, "Session 31 trade question 69 must require an answer.");
assert(!isForeignExchangeAnswerCorrect(answeredOnlyQuestion, undefined), "Answered-only credit must not score a blank answer.");
for (const answer of ["A", "B", "C", "D"] as const) {
  assert(isForeignExchangeAnswerCorrect(answeredOnlyQuestion, answer), `Answered-only credit must accept ${answer}.`);
}

console.log(`Foreign-exchange archive, protected mock grading, access and v83 function contracts passed (${routes.length}/12 functions).`);
