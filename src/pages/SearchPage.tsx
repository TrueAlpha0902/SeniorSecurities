import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { useAsync } from "../hooks/useAsync";
import { loadAllQuestions } from "../lib/data";
import { loadImageQuizBanks, type ImageQuizBank, type ImageQuizQuestion } from "../lib/imageQuiz";
import type { Question } from "../types";

const T = {
  loading: "載入搜尋資料",
  loadError: "無法載入搜尋資料",
  title: "搜尋題目",
  subtitle: "輸入關鍵字、科目、章節、來源檔名、題號或答案，快速找到想看的題目。",
  placeholder: "例如：債券、投資學、第一章、25、正解 3",
  imageSourceNote: "PDF 圖片題目前先支援科目、章節、檔名、題號與正解搜尋；若未來補上 OCR 文字欄位，就能擴充成題幹全文搜尋。",
  noQuery: "請先輸入關鍵字。",
  noResults: "找不到符合的題目。",
  resultCount: "筆結果",
  imageQuestion: "PDF 圖片題",
  textQuestion: "文字題庫",
  goPractice: "前往題目",
  openTextList: "查看文字題",
  correctAnswer: "正解",
  question: "題",
};

type ImageResult = {
  type: "image";
  bankId: string;
  bankTitle: string;
  chapterId: string;
  chapterTitle: string;
  question: ImageQuizQuestion;
  position: number;
};

type TextResult = {
  type: "text";
  question: Question;
};


type SearchData = {
  imageResults: ImageResult[];
  textQuestions: Question[];
};

async function loadSearchData(): Promise<SearchData> {
  const [imageBanks, textQuestions] = await Promise.all([
    loadImageQuizBanks(),
    loadAllQuestions().catch(() => [] as Question[]),
  ]);

  return {
    imageResults: flattenImageQuestions(imageBanks),
    textQuestions,
  };
}

export function SearchPage() {
  const [query, setQuery] = useState("");
  const { data, error, loading } = useAsync(loadSearchData, []);
  const normalizedQuery = normalizeSearchText(query);

  const results = useMemo(() => {
    if (!data || !normalizedQuery) {
      return [];
    }

    const imageMatches = data.imageResults.filter((result) =>
      buildImageHaystack(result).includes(normalizedQuery),
    );
    const textMatches = data.textQuestions
      .filter((question) => buildTextHaystack(question).includes(normalizedQuery))
      .map<TextResult>((question) => ({ type: "text", question }));

    return [...imageMatches, ...textMatches].slice(0, 80);
  }, [data, normalizedQuery]);

  if (loading) {
    return <LoadingState label={T.loading} />;
  }

  if (error) {
    return <ErrorState title={T.loadError} message={error} />;
  }

  return (
    <div className="page-stack search-page">
      <GlassCard className="search-hero">
        <p className="eyebrow">Search</p>
        <h1>{T.title}</h1>
        <p>{T.subtitle}</p>
        <label className="search-field">
          <Search aria-hidden="true" size={20} />
          <input
            type="search"
            value={query}
            placeholder={T.placeholder}
            aria-label={T.title}
            autoFocus
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <p className="helper-note">{T.imageSourceNote}</p>
        <div className="metric-row">
          <span className="glass-badge">{results.length} {T.resultCount}</span>
        </div>
      </GlassCard>

      {!normalizedQuery ? (
        <GlassCard className="state-card"><p>{T.noQuery}</p></GlassCard>
      ) : results.length === 0 ? (
        <GlassCard className="state-card"><p>{T.noResults}</p></GlassCard>
      ) : (
        <section className="search-result-list" aria-label={T.title}>
          {results.map((result) =>
            result.type === "image" ? <ImageSearchCard key={`${result.bankId}-${result.chapterId}-${result.question.id}`} result={result} /> : <TextSearchCard key={result.question.id} result={result} />,
          )}
        </section>
      )}
    </div>
  );
}

function ImageSearchCard({ result }: { result: ImageResult }) {
  return (
    <GlassCard className="search-result-card" as="article">
      <div>
        <p className="eyebrow">{T.imageQuestion}</p>
        <h2>{result.bankTitle} / {result.chapterTitle} / 第 {result.question.number} {T.question}</h2>
        <div className="metric-row">
          <span className="glass-badge">{T.correctAnswer} {result.question.answer}</span>
          <span className="glass-badge">{result.question.sourceFile}</span>
        </div>
      </div>
      <GlassLinkButton
        to={`/image-quiz/bank/${result.bankId}/chapter/${encodeURIComponent(result.chapterId)}?jump=${result.position}`}
        variant="primary"
      >
        {T.goPractice}
      </GlassLinkButton>
    </GlassCard>
  );
}

function TextSearchCard({ result }: { result: TextResult }) {
  const question = result.question;
  return (
    <GlassCard className="search-result-card" as="article">
      <div>
        <p className="eyebrow">{T.textQuestion}</p>
        <h2>{question.question}</h2>
        <p>{question.bankTitle} / {question.chapter}</p>
        <div className="metric-row">
          <span className="glass-badge">{T.correctAnswer} {question.answer}</span>
          <span className="glass-badge">{question.sourceFile}</span>
        </div>
      </div>
      <GlassLinkButton to={`/questions/bank/${question.bankId}/chapter/${encodeURIComponent(question.chapter)}`} variant="secondary">
        {T.openTextList}
      </GlassLinkButton>
    </GlassCard>
  );
}

function flattenImageQuestions(banks: ImageQuizBank[]): ImageResult[] {
  return banks.flatMap((bank) =>
    bank.chapters.flatMap((chapter) =>
      chapter.questions.map((question, index) => ({
        type: "image" as const,
        bankId: bank.bankId,
        bankTitle: bank.bankTitle,
        chapterId: chapter.chapterId,
        chapterTitle: [chapter.chapterTitle, chapter.chapterTopic].filter(Boolean).join(" "),
        question,
        position: index + 1,
      })),
    ),
  );
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildImageHaystack(result: ImageResult): string {
  return normalizeSearchText([
    result.bankId,
    result.bankTitle,
    result.chapterId,
    result.chapterTitle,
    result.question.number,
    `第 ${result.question.number} 題`,
    result.question.answer,
    `正解 ${result.question.answer}`,
    result.question.sourceFile,
  ].join(" "));
}

function buildTextHaystack(question: Question): string {
  return normalizeSearchText([
    question.bankId,
    question.bankTitle,
    question.chapter,
    question.question,
    question.options.A,
    question.options.B,
    question.options.C,
    question.options.D,
    question.answer,
    `正解 ${question.answer}`,
    question.explanation,
    question.sourceFile,
    ...(question.tags ?? []),
  ].join(" "));
}
