import { BookOpen, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth, type ExamId } from "../auth/AuthContext";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { formatLearnerText } from "../lib/learnerText";
import { GlassButton, GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { V93InlineNotice } from "../components/V93InteractionPrimitives";
import { announceInteractionFeedback } from "../lib/interactionFeedback";
import {
  searchQuestionBank,
  type ForeignExchangeSearchResult,
  type QuestionSearchResult,
  type SecuritiesSearchResult,
} from "../lib/questionSearch";

type ExamFilter = "all" | ExamId;

export function SearchPage() {
  const { user, hasExamAccess } = useAuth();
  const includeSecurities = Boolean(user && hasExamAccess("senior-securities"));
  const includeForeignExchange = Boolean(user && hasExamAccess("junior-foreign-exchange"));
  const [query, setQuery] = useState("");
  const [examFilter, setExamFilter] = useState<ExamFilter>("all");
  const [results, setResults] = useState<QuestionSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchRevision, setSearchRevision] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = normalizeSearchText(query);

  useEffect(() => {
    if (!user || normalizedQuery.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const exams: ExamId[] = [];
    if ((examFilter === "all" || examFilter === "senior-securities") && includeSecurities) exams.push("senior-securities");
    if ((examFilter === "all" || examFilter === "junior-foreign-exchange") && includeForeignExchange) exams.push("junior-foreign-exchange");
    if (!exams.length) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void Promise.all(exams.map((examId) => searchQuestionBank(examId, normalizedQuery, controller.signal)))
        .then((pages) => setResults(pages.flat().slice(0, 80)))
        .catch((reason: unknown) => {
          if (reason instanceof DOMException && reason.name === "AbortError") return;
          setResults([]);
          const message = reason instanceof Error ? reason.message : "搜尋失敗，請稍後再試。";
          setError(message);
          announceInteractionFeedback(message, "error", 4200);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 260);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [examFilter, includeForeignExchange, includeSecurities, normalizedQuery, searchRevision, user]);

  if (!user) {
    return <ErrorState title="請先登入" message="登入後才能搜尋已開通的題庫。" backLabel="前往登入" backTo="/auth" />;
  }

  if (!includeSecurities && !includeForeignExchange) {
    return <EmptyState title="尚未開通可搜尋的題庫" message="先輸入啟用碼開通證券高業或初階外匯，再回來跨題庫搜尋。" actionLabel="選擇題庫" actionTo="/" />;
  }

  function clearSearch(): void {
    setQuery("");
    setResults([]);
    setError(null);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className="page-stack product-search-page">
      <header className="product-search-head">
        <div><p>跨題庫查找</p><h1>搜尋題目</h1><span>只搜尋你已開通的題庫，結果不提供正解與解析。</span></div>
      </header>

      <GlassCard className="product-search-controls">
        <div className="product-search-field-wrap">
          <label className="product-search-field" htmlFor="question-search-input">
            <Search aria-hidden="true" size={20} />
            <input ref={inputRef} id="question-search-input" type="search" value={query} placeholder="至少兩個字，例如：債券、信用狀、資產報酬率" autoComplete="off" spellCheck={false} aria-label="搜尋題目" aria-describedby="question-search-status" aria-controls="question-search-results" onChange={(event) => setQuery(event.currentTarget.value)} />
          </label>
          {query ? <button type="button" className="v93-search-clear" aria-label="清除搜尋文字" onClick={clearSearch}><X aria-hidden="true" size={17} /></button> : null}
        </div>
        <div className="segmented-control" role="group" aria-label="題庫篩選">
          <button type="button" className={examFilter === "all" ? "is-active" : ""} aria-pressed={examFilter === "all"} onClick={() => setExamFilter("all")}>全部</button>
          {includeSecurities ? <button type="button" className={examFilter === "senior-securities" ? "is-active" : ""} aria-pressed={examFilter === "senior-securities"} onClick={() => setExamFilter("senior-securities")}>證券高業</button> : null}
          {includeForeignExchange ? <button type="button" className={examFilter === "junior-foreign-exchange" ? "is-active" : ""} aria-pressed={examFilter === "junior-foreign-exchange"} onClick={() => setExamFilter("junior-foreign-exchange")}>初階外匯</button> : null}
        </div>
      </GlassCard>

      {error ? <V93InlineNotice tone="error"><span>{error}</span><GlassButton variant="secondary" onClick={() => setSearchRevision((value) => value + 1)}>重新搜尋</GlassButton></V93InlineNotice> : null}
      <div id="question-search-status" className="product-search-summary" role="status" aria-live="polite" aria-atomic="true">
        <span>
          {normalizedQuery.length < 2
            ? "請輸入至少兩個字"
            : loading
              ? "搜尋中…"
              : `找到 ${results.length} 筆結果${results.length === 80 ? "（僅顯示前80筆）" : ""}`}
        </span>
      </div>

      {!loading && normalizedQuery.length >= 2 && results.length === 0 && !error ? (
        <EmptyState title="找不到符合的題目" message="可縮短關鍵字，或切換題庫篩選後再搜尋。" />
      ) : (
        <section id="question-search-results" className="product-search-results" aria-label="搜尋結果" aria-busy={loading}>
          {results.map((result) => result.examId === "senior-securities"
            ? <SecuritiesSearchCard key={result.id} result={result} />
            : <ForeignExchangeSearchCard key={result.id} result={result} />)}
        </section>
      )}
    </div>
  );
}

function SecuritiesSearchCard({ result }: { result: SecuritiesSearchResult }) {
  return (
    <GlassCard className="product-search-result" as="article">
      <div className="product-search-result-icon"><BookOpen aria-hidden="true" size={19} /></div>
      <div className="product-search-result-copy">
        <div className="product-search-result-meta"><span>證券高業</span><span>{result.bankTitle}</span><span>{result.chapterTitle}</span></div>
        <h2>{formatLearnerText(result.question)}</h2>
      </div>
      <GlassLinkButton to={`/image-quiz/bank/${result.bankId}/chapter/${encodeURIComponent(result.chapterId)}?jump=${result.questionNumber}`} variant="secondary" aria-label={`前往${result.bankTitle}${result.chapterTitle}第 ${result.questionNumber} 題`}>前往題目</GlassLinkButton>
    </GlassCard>
  );
}

function ForeignExchangeSearchCard({ result }: { result: ForeignExchangeSearchResult }) {
  return (
    <GlassCard className="product-search-result" as="article">
      <div className="product-search-result-icon"><BookOpen aria-hidden="true" size={19} /></div>
      <div className="product-search-result-copy">
        <div className="product-search-result-meta"><span>初階外匯</span><span>第{result.session}屆</span><span>{result.bankTitle}</span></div>
        <h2>{formatLearnerText(result.question)}</h2>
      </div>
      <GlassLinkButton to={`/foreign-exchange/practice?mode=practice&id=${encodeURIComponent(result.id)}`} variant="secondary" aria-label={`前往第 ${result.session} 屆${result.bankTitle}題目`}>前往題目</GlassLinkButton>
    </GlassCard>
  );
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
