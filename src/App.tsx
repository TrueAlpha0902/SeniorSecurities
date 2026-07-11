import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { DeferredAnalytics } from "./components/DeferredAnalytics";
import { LoadingState } from "./components/LoadingState";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";

const AccountPage = lazy(() => import("./pages/AccountPage").then((module) => ({ default: module.AccountPage })));
const ActivatePage = lazy(() => import("./pages/ActivatePage").then((module) => ({ default: module.ActivatePage })));
const AdminPage = lazy(() => import("./pages/AdminPage").then((module) => ({ default: module.AdminPage })));
const AnswerDrillPage = lazy(() => import("./pages/AnswerDrillPage").then((module) => ({ default: module.AnswerDrillPage })));
const AuthPage = lazy(() => import("./pages/AuthPage").then((module) => ({ default: module.AuthPage })));
const BankPage = lazy(() => import("./pages/BankPage").then((module) => ({ default: module.BankPage })));
const ForgotPasswordPage = lazy(() =>
  import("./pages/ForgotPasswordPage").then((module) => ({ default: module.ForgotPasswordPage })),
);
const HomePage = lazy(() => import("./pages/HomePage").then((module) => ({ default: module.HomePage })));
const ImageQuizPage = lazy(() => import("./pages/ImageQuizPage").then((module) => ({ default: module.ImageQuizPage })));
const LeaderboardPage = lazy(() =>
  import("./pages/LeaderboardPage").then((module) => ({ default: module.LeaderboardPage })),
);
const QuestionsPage = lazy(() => import("./pages/QuestionsPage").then((module) => ({ default: module.QuestionsPage })));
const QuizPage = lazy(() => import("./pages/QuizPage").then((module) => ({ default: module.QuizPage })));
const RandomPracticePage = lazy(() => import("./pages/RandomPracticePage").then((module) => ({ default: module.RandomPracticePage })));
const ResetPasswordPage = lazy(() =>
  import("./pages/ResetPasswordPage").then((module) => ({ default: module.ResetPasswordPage })),
);
const ResultPage = lazy(() => import("./pages/ResultPage").then((module) => ({ default: module.ResultPage })));
const ReviewPage = lazy(() => import("./pages/ReviewPage").then((module) => ({ default: module.ReviewPage })));
const SimilarQuestionsPage = lazy(() =>
  import("./pages/SimilarQuestionsPage").then((module) => ({ default: module.SimilarQuestionsPage })),
);

function RequireActive({ children }: { children: ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

function HomeEntry() {
  const { loading, user } = useAuth();
  if (loading) return <LoadingState label="檢查登入狀態" />;
  if (!user) return <Navigate to="/auth" replace state={{ returnTo: "/" }} />;
  return <HomePage />;
}

export function App() {
  return (
    <AuthProvider>
      <AppLayout>
        <Suspense fallback={<LoadingState label="載入頁面" />}>
          <Routes>
            <Route path="/" element={<HomeEntry />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/activate" element={<ActivatePage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/leaderboard" element={<RequireActive><LeaderboardPage /></RequireActive>} />
            <Route path="/trial" element={<ImageQuizPage />} />

            <Route path="/banks/:bankId" element={<RequireActive><BankPage /></RequireActive>} />
            <Route path="/questions/all" element={<RequireActive><QuestionsPage /></RequireActive>} />
            <Route path="/questions/bank/:bankId" element={<RequireActive><QuestionsPage /></RequireActive>} />
            <Route path="/questions/bank/:bankId/chapter/:chapterId" element={<RequireActive><QuestionsPage /></RequireActive>} />
            <Route path="/answer-drill" element={<RequireActive><AnswerDrillPage /></RequireActive>} />
            <Route path="/similar" element={<RequireActive><SimilarQuestionsPage /></RequireActive>} />
            <Route path="/random" element={<RequireActive><RandomPracticePage /></RequireActive>} />
            <Route path="/image-quiz/daily" element={<RequireActive><ImageQuizPage /></RequireActive>} />
            <Route path="/image-quiz/today-wrong" element={<RequireActive><ImageQuizPage /></RequireActive>} />
            <Route path="/image-quiz/all" element={<RequireActive><ImageQuizPage /></RequireActive>} />
            <Route path="/image-quiz/wrong" element={<RequireActive><ImageQuizPage /></RequireActive>} />
            <Route path="/image-quiz/favorites" element={<RequireActive><ImageQuizPage /></RequireActive>} />
            <Route path="/image-quiz/random/:bankId/:sessionId" element={<RequireActive><ImageQuizPage /></RequireActive>} />
            <Route path="/image-quiz/session-wrong/:sessionId" element={<RequireActive><ImageQuizPage /></RequireActive>} />
            <Route path="/image-quiz/bank/:bankId" element={<RequireActive><ImageQuizPage /></RequireActive>} />
            <Route path="/image-quiz/bank/:bankId/chapter/:chapterId" element={<RequireActive><ImageQuizPage /></RequireActive>} />
            <Route path="/quiz/bank/:bankId" element={<RequireActive><QuizPage /></RequireActive>} />
            <Route path="/quiz/bank/:bankId/chapter/:chapterId" element={<RequireActive><QuizPage /></RequireActive>} />
            <Route path="/quiz/all" element={<RequireActive><QuizPage /></RequireActive>} />
            <Route path="/quiz/wrong" element={<RequireActive><QuizPage /></RequireActive>} />
            <Route path="/quiz/favorites" element={<RequireActive><QuizPage /></RequireActive>} />
            <Route path="/result" element={<RequireActive><ResultPage /></RequireActive>} />
            <Route path="/review" element={<RequireActive><ReviewPage /></RequireActive>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AppLayout>
      <DeferredAnalytics />
    </AuthProvider>
  );
}
