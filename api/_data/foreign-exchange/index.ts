import remittance45 from "./45-remittance.json";
import trade45 from "./45-trade.json";
import remittance46 from "./46-remittance.json";
import trade46 from "./46-trade.json";
import remittance47 from "./47-remittance.json";
import trade47 from "./47-trade.json";
import manifest from "./manifest.json";

export type ForeignExchangeAnswerKey = "A" | "B" | "C" | "D";
export type ForeignExchangeSubjectId = "remittance" | "trade";
export type ForeignExchangeSession = 45 | 46 | 47;

export type ForeignExchangeQuestionRecord = {
  id: string;
  examId: "junior-foreign-exchange";
  bankId: string;
  bankTitle: string;
  chapter: string;
  question: string;
  options: Record<ForeignExchangeAnswerKey, string>;
  answer: ForeignExchangeAnswerKey;
  explanation: string;
  sourceFile: string;
  batchId: string;
  importedAt: string;
  reviewStatus: string;
  tags: string[];
  session: ForeignExchangeSession;
  subjectId: ForeignExchangeSubjectId;
  questionNumber: number;
  standardVersion: "SWIFT MT" | "ISO 20022";
  sourcePage: number;
  sourceTextSha256: string;
};

export type ForeignExchangeManifest = typeof manifest;

const shards = [
  remittance45,
  trade45,
  remittance46,
  trade46,
  remittance47,
  trade47,
] as unknown as ForeignExchangeQuestionRecord[][];

export const foreignExchangeManifest = manifest;
export const foreignExchangeQuestions = shards.flat();
