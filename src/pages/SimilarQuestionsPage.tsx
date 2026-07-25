import {
  BookOpen,
  BrainCircuit,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  GitCompareArrows,
  Lightbulb,
  RotateCcw,
  Target,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { GlassButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { PdfSegmentStack } from "../components/PdfSegmentStack";
import { useAsync } from "../hooks/useAsync";
import { recordImageUserAnswer } from "../lib/db";
import {
  loadImageQuestionsByIds,
  loadSimilarQuestionGroups,
  type ImageQuizQuestion,
  type NumericAnswer,
  type SimilarQuestionGroup,
} from "../lib/imageQuiz";
import {
  readScopedStorageItem,
  writeScopedStorageItem,
} from "../lib/userScopedStorage";
import "../styles/similar-learning-v66.css";

const ANSWERS: NumericAnswer[] = ["1", "2", "3", "4"];
const MASTERY_KEY = "senior-securities:similar-mastery:v66";
const NOTES_KEY = "senior-securities:similar-notes:v66";

type SimilarPageData = {
  groups: SimilarQuestionGroup[];
  questionsById: Map<string, ImageQuizQuestion>;
};
type ResolvedSimilarGroup = SimilarQuestionGroup & {
  questions: ImageQuizQuestion[];
};
type AnswerState = Record<string, NumericAnswer>;
type GroupNotes = Record<string, string>;

async function loadSimilarPageData(): Promise<SimilarPageData> {
  const groups = await loadSimilarQuestionGroups();
  const questionIds = [
    ...new Set(groups.flatMap((group) => group.questionIds)),
  ];
  const questions = await loadImageQuestionsByIds(questionIds);
  return {
    groups,
    questionsById: new Map(
      questions.map((question) => [question.id, question]),
    ),
  };
}

function loadMasteredGroups(): Set<string> {
  try {
    return new Set(
      JSON.parse(readScopedStorageItem(MASTERY_KEY) || "[]") as string[],
    );
  } catch {
    return new Set();
  }
}

function loadGroupNotes(): GroupNotes {
  try {
    return JSON.parse(readScopedStorageItem(NOTES_KEY) || "{}") as GroupNotes;
  } catch {
    return {};
  }
}

export function SimilarQuestionsPage() {
  const { data, error, loading } = useAsync(loadSimilarPageData, []);
  const [selectedBankId, setSelectedBankId] = useState("all");
  const [answers, setAnswers] = useState<AnswerState>({});
  const [revealedGroups, setRevealedGroups] = useState<Set<string>>(new Set());
  const [masteredGroups, setMasteredGroups] =
    useState<Set<string>>(loadMasteredGroups);
  const [focusMode, setFocusMode] = useState(true);
  const [focusIndex, setFocusIndex] = useState(0);
  const [showMastered, setShowMastered] = useState(true);
  const [groupNotes, setGroupNotes] = useState<GroupNotes>(loadGroupNotes);
  const [savingAttempt, setSavingAttempt] = useState(false);

  const groups = useMemo<ResolvedSimilarGroup[]>(() => {
    if (!data) return [];
    return data.groups
      .map((group) => ({
        ...group,
        questions: group.questionIds
          .map((id) => data.questionsById.get(id))
          .filter((question): question is ImageQuizQuestion =>
            Boolean(question),
          ),
      }))
      .filter((group) => group.questions.length >= 2);
  }, [data]);

  const bankOptions = useMemo(() => {
    const byId = new Map<string, string>();
    groups.forEach((group) => byId.set(group.bankId, group.bankTitle));
    return Array.from(byId, ([bankId, bankTitle]) => ({
      bankId,
      bankTitle,
    })).sort((a, b) => a.bankTitle.localeCompare(b.bankTitle, "zh-Hant"));
  }, [groups]);

  const filteredGroups = useMemo(
    () =>
      groups.filter(
        (group) =>
          (selectedBankId === "all" || group.bankId === selectedBankId) &&
          (showMastered || !masteredGroups.has(group.id)),
      ),
    [groups, masteredGroups, selectedBankId, showMastered],
  );
  const visibleGroups = focusMode
    ? filteredGroups.slice(focusIndex, focusIndex + 1)
    : filteredGroups;
  const visibleQuestionCount = filteredGroups.reduce(
    (sum, group) => sum + group.questions.length,
    0,
  );
  const masteredCount = filteredGroups.filter((group) =>
    masteredGroups.has(group.id),
  ).length;

  useEffect(() => {
    setFocusIndex(0);
  }, [selectedBankId, showMastered]);
  useEffect(() => {
    writeScopedStorageItem(
      MASTERY_KEY,
      JSON.stringify(Array.from(masteredGroups)),
    );
  }, [masteredGroups]);
  useEffect(() => {
    writeScopedStorageItem(NOTES_KEY, JSON.stringify(groupNotes));
  }, [groupNotes]);

  if (loading) return <LoadingState label="載入相似題學習" />;
  if (error) return <ErrorState message={error} />;
  if (!groups.length)
    return (
      <EmptyState
        title="目前沒有相似題組"
        message="重建相似題索引後會在這裡顯示。"
      />
    );

  async function revealGroup(group: ResolvedSimilarGroup): Promise<void> {
    const answeredQuestions = group.questions.filter(
      (question) => answers[question.id],
    );
    if (answeredQuestions.length !== group.questions.length) return;
    setSavingAttempt(true);
    try {
      await Promise.all(
        answeredQuestions.map((question) => {
          const selected = answers[question.id];
          if (!selected) throw new Error("尚有題目未作答。");
          return recordImageUserAnswer(question, selected, {
            confidence: selected === question.answer ? "sure" : "unsure",
            sessionId: group.id,
            sessionMode: "similar-comparison",
          });
        }),
      );
      setRevealedGroups((current) => new Set(current).add(group.id));
    } finally {
      setSavingAttempt(false);
    }
  }

  function toggleMastered(groupId: string) {
    setMasteredGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function resetGroup(group: ResolvedSimilarGroup) {
    setAnswers((current) => {
      const next = { ...current };
      group.questions.forEach((question) => delete next[question.id]);
      return next;
    });
    setRevealedGroups((current) => {
      const next = new Set(current);
      next.delete(group.id);
      return next;
    });
  }

  function retryWrongOnly(group: ResolvedSimilarGroup): void {
    setAnswers((current) => {
      const next = { ...current };
      group.questions.forEach((question) => {
        if (next[question.id] !== question.answer) delete next[question.id];
      });
      return next;
    });
    setRevealedGroups((current) => {
      const next = new Set(current);
      next.delete(group.id);
      return next;
    });
  }

  return (
    <div className="page-stack similar-learning-page">
      <GlassCard className="similar-learning-hero">
        <div className="similar-learning-heading">
          <span>
            <BrainCircuit size={24} />
          </span>
          <div>
            <p className="eyebrow">Active Comparison</p>
            <h1>相似題辨識訓練</h1>
            <p>
              先獨立判斷每一題，再一次揭曉差異。用主動回想取代直接看答案，降低相似題混淆。
            </p>
          </div>
        </div>
        <div className="similar-learning-kpis">
          <div>
            <Target size={17} />
            <span>可練題組</span>
            <strong>{filteredGroups.length}</strong>
          </div>
          <div>
            <BookOpen size={17} />
            <span>題目數</span>
            <strong>{visibleQuestionCount}</strong>
          </div>
          <div>
            <Check size={17} />
            <span>已掌握</span>
            <strong>{masteredCount}</strong>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="similar-learning-toolbar" as="section">
        <div className="similar-filter" aria-label="科目篩選">
          <button
            type="button"
            className={`filter-pill ${selectedBankId === "all" ? "is-active" : ""}`}
            onClick={() => setSelectedBankId("all")}
          >
            <BookOpen size={18} />
            全部科目
          </button>
          {bankOptions.map((option) => (
            <button
              key={option.bankId}
              type="button"
              className={`filter-pill ${selectedBankId === option.bankId ? "is-active" : ""}`}
              onClick={() => setSelectedBankId(option.bankId)}
            >
              {option.bankTitle}
            </button>
          ))}
        </div>
        <div className="similar-learning-controls">
          <label>
            <input
              type="checkbox"
              checked={focusMode}
              onChange={(event) => setFocusMode(event.currentTarget.checked)}
            />
            <span>專注模式</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={showMastered}
              onChange={(event) => setShowMastered(event.currentTarget.checked)}
            />
            <span>顯示已掌握</span>
          </label>
        </div>
      </GlassCard>

      <GlassCard className="similar-learning-method" as="section">
        <div>
          <span>1</span>
          <strong>先找差異</strong>
          <small>圈出期間、主體、比例、例外與否定詞。</small>
        </div>
        <div>
          <span>2</span>
          <strong>獨立作答</strong>
          <small>不要先看同組其他題的答案。</small>
        </div>
        <div>
          <span>3</span>
          <strong>寫最小線索</strong>
          <small>用一句話記下造成答案改變的關鍵。</small>
        </div>
        <div>
          <span>4</span>
          <strong>只重做錯題</strong>
          <small>立即再測一次，再交給間隔複習排程。</small>
        </div>
      </GlassCard>

      {focusMode && filteredGroups.length ? (
        <div className="similar-focus-navigation">
          <button
            disabled={focusIndex <= 0}
            onClick={() => setFocusIndex((value) => Math.max(0, value - 1))}
          >
            <ChevronLeft size={17} />
            上一組
          </button>
          <span>
            第 {focusIndex + 1} / {filteredGroups.length} 組
          </span>
          <button
            disabled={focusIndex >= filteredGroups.length - 1}
            onClick={() =>
              setFocusIndex((value) =>
                Math.min(filteredGroups.length - 1, value + 1),
              )
            }
          >
            下一組
            <ChevronRight size={17} />
          </button>
        </div>
      ) : null}

      <section className="similar-learning-list">
        {visibleGroups.map((group) => {
          const revealed = revealedGroups.has(group.id);
          const answeredCount = group.questions.filter(
            (question) => answers[question.id],
          ).length;
          const correctCount = group.questions.filter(
            (question) => answers[question.id] === question.answer,
          ).length;
          const isMastered = masteredGroups.has(group.id);
          const answerDistribution = Array.from(
            new Set(group.questions.map((question) => question.answer)),
          );
          return (
            <GlassCard
              key={group.id}
              className={`similar-learning-group${isMastered ? " is-mastered" : ""}`}
              as="article"
            >
              <header>
                <div>
                  <p className="eyebrow">
                    {group.bankTitle} / {group.chapterTitle}
                  </p>
                  <h2>
                    <GitCompareArrows size={21} />第{" "}
                    {group.questions
                      .map((question) => question.number)
                      .join("、")}{" "}
                    題
                  </h2>
                  <p>
                    相似度 {Math.max(0, Math.round((1 - group.score) * 100))}% ·
                    請先完成每題判斷，再查看共同陷阱。
                  </p>
                </div>
                <div className="similar-learning-status">
                  <span>
                    {answeredCount}/{group.questions.length} 已作答
                  </span>
                  {revealed ? (
                    <strong>
                      {correctCount}/{group.questions.length} 答對
                    </strong>
                  ) : null}
                </div>
              </header>

              <div className="similar-learning-question-grid">
                {group.questions.map((question) => {
                  const selected = answers[question.id];
                  const isCorrect = selected === question.answer;
                  return (
                    <article
                      key={question.id}
                      className={`similar-learning-question${revealed && selected ? (isCorrect ? " is-correct" : " is-wrong") : ""}`}
                    >
                      <div className="similar-learning-question-head">
                        <strong>第 {question.number} 題</strong>
                        {revealed ? (
                          <span>正解 ({question.answer})</span>
                        ) : (
                          <span>
                            <EyeOff size={14} />
                            答案已隱藏
                          </span>
                        )}
                      </div>
                      <PdfSegmentStack
                        label={`${question.bankTitle} ${question.chapterTitle} ${question.number} 題`}
                        segments={question.questionSegments}
                        priority="low"
                      />
                      <div
                        className="similar-learning-answer-grid"
                        aria-label={`第 ${question.number} 題作答`}
                      >
                        {ANSWERS.map((answer) => (
                          <button
                            key={answer}
                            type="button"
                            disabled={revealed}
                            className={`${selected === answer ? "is-selected" : ""}${revealed && answer === question.answer ? " is-answer" : ""}${revealed && selected === answer && answer !== question.answer ? " is-wrong" : ""}`}
                            onClick={() =>
                              setAnswers((current) => ({
                                ...current,
                                [question.id]: answer,
                              }))
                            }
                          >
                            ({answer})
                          </button>
                        ))}
                      </div>
                      {revealed ? (
                        <div className="similar-learning-explanation">
                          <strong>
                            {selected
                              ? isCorrect
                                ? "判斷正確"
                                : `你選了 (${selected})`
                              : "本題未作答"}
                          </strong>
                          {question.explanationSegments.length ? (
                            <PdfSegmentStack
                              label={`第 ${question.number} 題解析`}
                              segments={question.explanationSegments}
                              priority="auto"
                            />
                          ) : (
                            <p>本題目前沒有解析圖片。</p>
                          )}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>

              {revealed ? (
                <div className="similar-learning-insight">
                  <span>
                    <Lightbulb size={20} />
                  </span>
                  <div>
                    <strong>本組辨識重點</strong>
                    <p>
                      {answerDistribution.length === 1
                        ? `題目外觀不同，但本組正解都落在 (${answerDistribution[0]})；請找出共同計算規則或法規條件。`
                        : `本組正解分布為 ${answerDistribution.map((answer) => `(${answer})`).join("、")}；代表相似題幹中的期間、百分比、主體或例外條件會改變答案。`}{" "}
                      本次錯了 ${group.questions.length - correctCount}{" "}
                      題；請把錯誤歸因到「看漏條件、概念混淆、計算失誤、純猜」其中一類。
                    </p>
                  </div>
                </div>
              ) : null}

              <label className="similar-difference-note">
                <span>我的最小差異線索</span>
                <textarea
                  value={groupNotes[group.id] || ""}
                  maxLength={240}
                  placeholder="例如：只有第 103 題問的是年利率，不是半年利率；看到『每半年』要先換算。"
                  onChange={(event) =>
                    setGroupNotes((current) => ({
                      ...current,
                      [group.id]: event.target.value,
                    }))
                  }
                />
                <small>
                  {(groupNotes[group.id] || "").length}/240 ·
                  這段筆記只保存在你的裝置
                </small>
              </label>

              <footer>
                <div>
                  {revealed ? (
                    <>
                      <button
                        type="button"
                        className="similar-reset"
                        onClick={() => resetGroup(group)}
                      >
                        <RotateCcw size={16} />
                        全部重做
                      </button>
                      {correctCount < group.questions.length ? (
                        <button
                          type="button"
                          className="similar-reset"
                          onClick={() => retryWrongOnly(group)}
                        >
                          <RotateCcw size={16} />
                          只重做錯題
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <span>
                      {answeredCount < group.questions.length
                        ? `還有 ${group.questions.length - answeredCount} 題未作答`
                        : "已全部作答，可以揭曉"}
                    </span>
                  )}
                </div>
                <div>
                  {!revealed ? (
                    <GlassButton
                      variant="primary"
                      disabled={
                        answeredCount !== group.questions.length ||
                        savingAttempt
                      }
                      onClick={() => void revealGroup(group)}
                    >
                      <Eye size={17} />
                      {savingAttempt ? "紀錄學習中" : "揭曉答案與差異"}
                    </GlassButton>
                  ) : (
                    <GlassButton
                      variant={isMastered ? "secondary" : "primary"}
                      disabled={
                        !isMastered && correctCount !== group.questions.length
                      }
                      onClick={() => toggleMastered(group.id)}
                    >
                      <Check size={17} />
                      {isMastered
                        ? "取消已掌握"
                        : correctCount === group.questions.length
                          ? "標記已掌握"
                          : "全對後可標記"}
                    </GlassButton>
                  )}
                </div>
              </footer>
            </GlassCard>
          );
        })}
      </section>
    </div>
  );
}
