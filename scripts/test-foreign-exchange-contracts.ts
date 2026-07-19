import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(root, relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const [
  app,
  auth,
  protectedRoute,
  questionApi,
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
] = await Promise.all([
  read("src/App.tsx"),
  read("src/auth/AuthContext.tsx"),
  read("src/auth/ProtectedRoute.tsx"),
  read("api/foreign-exchange/questions.ts"),
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
]);

assert(app.includes('examId="senior-securities"') && app.includes('examId="junior-foreign-exchange"'), "Each question bank must have its own protected route scope.");
assert(app.includes('path="/foreign-exchange"') && app.includes('path="/foreign-exchange/practice"'), "Foreign-exchange routes are missing.");
assert(auth.includes('EXAM_IDS = ["senior-securities", "junior-foreign-exchange"]'), "Auth must load both entitlement scopes.");
assert(auth.includes('.from("user_exam_entitlements")'), "Auth must read exam-scoped entitlements.");
assert(protectedRoute.includes("getExamAccess(examId)"), "Route protection must evaluate the requested exam entitlement.");

assert(questionApi.includes("requireAuthenticatedUser(req)"), "Foreign-exchange data API must authenticate the user.");
assert(questionApi.includes('.from("user_exam_entitlements")') && questionApi.includes('.eq("exam_id", EXAM_ID)'), "Foreign-exchange data API must enforce the foreign-exchange entitlement.");
assert(questionApi.includes('type ClientQuestion = Pick<'), "The data API must use an explicit learner-facing projection.");
for (const internalField of ["sourceFile", "sourcePage", "sourceTextSha256", "reviewStatus", "officialUrl"]) {
  const projection = questionApi.slice(questionApi.indexOf("function toClientQuestion"), questionApi.indexOf("export default"));
  assert(!projection.includes(internalField), `${internalField} must not be returned to learners.`);
}

assert(practice.includes("<h3>解析</h3>") && practice.includes("currentQuestion.explanation"), "Every revealed answer must show its explanation.");
assert(practice.includes("submitted || (!isMock && selectedAnswer)"), "Mock answers and explanations must remain hidden until submission.");
assert(
  practice.includes("isMock && !submitted") && practice.includes("<span>未作答</span>"),
  "Mock side statistics must not expose correct/wrong counts before submission.",
);
for (const removedCopy of ["作答後立即顯示解析", "交卷後顯示答案與解析", "PDF頁碼", "SHA-256", "OCR", "AI生成"]) {
  assert(!practice.includes(removedCopy), `Learner UI must not show unnecessary note: ${removedCopy}`);
}
assert(!catalog.includes("Exam Library") && !catalog.includes("選擇要練習的證照"), "Catalog duplicate explanatory copy must stay removed.");
assert(!home.includes("Junior Foreign Exchange") && !home.includes("第45至47屆，共390題"), "Foreign-exchange home duplicate explanatory copy must stay removed.");
assert(account.includes("證券高業") && account.includes("初階外匯") && account.includes("examAccess"), "Account page must show each question-bank entitlement separately.");

assert(adminTools.includes("create_activation_code_v80") === false, "Client must call the API rather than a database RPC directly.");
assert(adminTools.includes('value="junior-foreign-exchange"') && adminTools.includes('value="senior-securities"'), "Activation-code admin UI must select the target question bank.");
assert(adminAction.includes("normalizeExamId(body.examId)") && adminAction.includes('.eq("exam_id", examId)'), "Admin entitlement actions must be scoped to one question bank.");
assert(adminPage.includes("EXAM_IDS.map") && adminPage.includes("examId }),"), "Admin member controls must send an explicit question-bank scope.");
assert(adminUsers.includes("entitlements") && adminDetail.includes("entitlements: normalizedEntitlements"), "Admin APIs must return both entitlement states.");

assert(migration.includes("create table if not exists public.user_exam_entitlements"), "Exam-scoped entitlement table migration is missing.");
assert(migration.includes("primary key (user_id, exam_id)"), "Each user/question-bank entitlement must be independently keyed.");
assert(migration.includes("create_activation_code_v80") && migration.includes("code_record.exam_id"), "Activation redemption must grant the code's own question bank.");

console.log("Foreign-exchange access, learner UI and explanation contracts passed.");
