import { Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { AppLayout } from "./components/AppLayout";
import { AppUpdateNotice } from "./components/AppUpdateNotice";
import { DeferredAnalytics } from "./components/DeferredAnalytics";
import { HashScrollManager } from "./components/HashScrollManager";
import { InteractionFeedbackHost } from "./components/InteractionFeedbackHost";
import { LoadingState } from "./components/LoadingState";
import { AuthProvider, type ExamId, useAuth } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { lazyWithRetry } from "./lib/lazyWithRetry";

const AccountPage = lazyWithRetry(() => import("./pages/AccountPage").then((module) => ({ default: module.AccountPage })));
const ActivatePage = lazyWithRetry(() => import("./pages/ActivatePage").then((module) => ({ default: module.ActivatePage })));
const AdminPage = lazyWithRetry(() => import("./pages/AdminPage").then((module) => ({ default: module.AdminPage })));
const AnswerDrillPage = lazyWithRetry(() => import("./pages/AnswerDrillPage").then((module) => ({ default: module.AnswerDrillPage })));
const AuthPage = lazyWithRetry(() => import("./pages/AuthPage").then((module) => ({ default: module.AuthPage })));
const BankPage = lazyWithRetry(() => import("./pages/BankPage").then((module) => ({ default: module.BankPage })));
const ExamCatalogPage = lazyWithRetry(() => import("./pages/ExamCatalogPage").then((module) => ({ default: module.ExamCatalogPage })));
const ForeignExchangeHomePage = lazyWithRetry(() => import("./pages/ForeignExchangeHomePage").then((module) => ({ default: module.ForeignExchangeHomePage })));
const ForeignExchangePracticePage = lazyWithRetry(() => import("./pages/ForeignExchangePracticePage").then((module) => ({ default: module.ForeignExchangePracticePage })));
const ForgotPasswordPage = lazyWithRetry(() => import("./pages/ForgotPasswordPage").then((module) => ({ default: module.ForgotPasswordPage })));
const HomePage = lazyWithRetry(() => import("./pages/HomePage").then((module) => ({ default: module.HomePage })));
const ImageQuizPage = lazyWithRetry(() => import("./pages/ImageQuizPage").then((module) => ({ default: module.ImageQuizPage })));
const LeaderboardPage = lazyWithRetry(() => import("./pages/LeaderboardPage").then((module) => ({ default: module.LeaderboardPage })));
const RandomPracticePage = lazyWithRetry(() => import("./pages/RandomPracticePage").then((module) => ({ default: module.RandomPracticePage })));
const ResetPasswordPage = lazyWithRetry(() => import("./pages/ResetPasswordPage").then((module) => ({ default: module.ResetPasswordPage })));
const SimilarQuestionsPage = lazyWithRetry(() => import("./pages/SimilarQuestionsPage").then((module) => ({ default: module.SimilarQuestionsPage })));
const SearchPage = lazyWithRetry(() => import("./pages/SearchPage").then((module) => ({ default: module.SearchPage })));

function RequireExam({ children, examId }: { children: ReactNode; examId: ExamId }) {
  return <ProtectedRoute examId={examId}>{children}</ProtectedRoute>;
}

function CatalogEntry() {
  const { loading, user } = useAuth();
  if (loading) return <LoadingState label="檢查登入狀態" />;
  if (!user) return <Navigate to="/auth" replace state={{ returnTo: "/" }} />;
  return <ExamCatalogPage />;
}

const securities = (children: ReactNode) => <RequireExam examId="senior-securities">{children}</RequireExam>;
const foreignExchange = (children: ReactNode) => <RequireExam examId="junior-foreign-exchange">{children}</RequireExam>;

export function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <HashScrollManager />
        <AppLayout>
          <Suspense fallback={<LoadingState label="載入頁面" />}>
            <Routes>
              <Route path="/" element={<CatalogEntry />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/activate" element={<ActivatePage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/search" element={<ProtectedRoute requireActivation={false}><SearchPage /></ProtectedRoute>} />
              <Route path="/trial" element={<ImageQuizPage />} />

              <Route path="/securities" element={securities(<HomePage />)} />
              <Route path="/leaderboard" element={securities(<LeaderboardPage />)} />
              <Route path="/banks/:bankId" element={securities(<BankPage />)} />
              <Route path="/answer-drill" element={securities(<AnswerDrillPage />)} />
              <Route path="/similar" element={securities(<SimilarQuestionsPage />)} />
              <Route path="/random" element={securities(<RandomPracticePage />)} />
              <Route path="/image-quiz/daily" element={securities(<ImageQuizPage />)} />
              <Route path="/image-quiz/today-wrong" element={securities(<ImageQuizPage />)} />
              <Route path="/image-quiz/all" element={securities(<ImageQuizPage />)} />
              <Route path="/image-quiz/wrong" element={securities(<ImageQuizPage />)} />
              <Route path="/image-quiz/favorites" element={securities(<ImageQuizPage />)} />
              <Route path="/image-quiz/random/:bankId/:sessionId" element={securities(<ImageQuizPage />)} />
              <Route path="/image-quiz/session-wrong/:sessionId" element={securities(<ImageQuizPage />)} />
              <Route path="/image-quiz/bank/:bankId" element={securities(<ImageQuizPage />)} />
              <Route path="/image-quiz/bank/:bankId/chapter/:chapterId" element={securities(<ImageQuizPage />)} />
              <Route path="/questions/*" element={<Navigate to="/search" replace />} />
              <Route path="/quiz/*" element={<Navigate to="/securities" replace />} />
              <Route path="/result" element={<Navigate to="/securities" replace />} />
              <Route path="/review" element={<Navigate to="/securities" replace />} />

              <Route path="/foreign-exchange" element={foreignExchange(<ForeignExchangeHomePage />)} />
              <Route path="/foreign-exchange/practice" element={foreignExchange(<ForeignExchangePracticePage />)} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AppLayout>
        <AppUpdateNotice />
        <DeferredAnalytics />
        <InteractionFeedbackHost />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
