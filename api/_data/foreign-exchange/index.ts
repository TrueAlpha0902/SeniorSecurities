import remittance23 from "./23-remittance.json" with { type: "json" };
import trade23 from "./23-trade.json" with { type: "json" };
import remittance24 from "./24-remittance.json" with { type: "json" };
import trade24 from "./24-trade.json" with { type: "json" };
import remittance25 from "./25-remittance.json" with { type: "json" };
import trade25 from "./25-trade.json" with { type: "json" };
import remittance26 from "./26-remittance.json" with { type: "json" };
import trade26 from "./26-trade.json" with { type: "json" };
import remittance27 from "./27-remittance.json" with { type: "json" };
import trade27 from "./27-trade.json" with { type: "json" };
import remittance28 from "./28-remittance.json" with { type: "json" };
import trade28 from "./28-trade.json" with { type: "json" };
import remittance29 from "./29-remittance.json" with { type: "json" };
import trade29 from "./29-trade.json" with { type: "json" };
import remittance30 from "./30-remittance.json" with { type: "json" };
import trade30 from "./30-trade.json" with { type: "json" };
import remittance31 from "./31-remittance.json" with { type: "json" };
import trade31 from "./31-trade.json" with { type: "json" };
import remittance32 from "./32-remittance.json" with { type: "json" };
import trade32 from "./32-trade.json" with { type: "json" };
import remittance33 from "./33-remittance.json" with { type: "json" };
import trade33 from "./33-trade.json" with { type: "json" };
import remittance34 from "./34-remittance.json" with { type: "json" };
import trade34 from "./34-trade.json" with { type: "json" };
import remittance35 from "./35-remittance.json" with { type: "json" };
import trade35 from "./35-trade.json" with { type: "json" };
import remittance36 from "./36-remittance.json" with { type: "json" };
import trade36 from "./36-trade.json" with { type: "json" };
import remittance37 from "./37-remittance.json" with { type: "json" };
import trade37 from "./37-trade.json" with { type: "json" };
import remittance38 from "./38-remittance.json" with { type: "json" };
import trade38 from "./38-trade.json" with { type: "json" };
import remittance39 from "./39-remittance.json" with { type: "json" };
import trade39 from "./39-trade.json" with { type: "json" };
import remittance40 from "./40-remittance.json" with { type: "json" };
import trade40 from "./40-trade.json" with { type: "json" };
import remittance41 from "./41-remittance.json" with { type: "json" };
import trade41 from "./41-trade.json" with { type: "json" };
import remittance42 from "./42-remittance.json" with { type: "json" };
import trade42 from "./42-trade.json" with { type: "json" };
import remittance43 from "./43-remittance.json" with { type: "json" };
import trade43 from "./43-trade.json" with { type: "json" };
import remittance44 from "./44-remittance.json" with { type: "json" };
import trade44 from "./44-trade.json" with { type: "json" };
import remittance45 from "./45-remittance.json" with { type: "json" };
import trade45 from "./45-trade.json" with { type: "json" };
import remittance46 from "./46-remittance.json" with { type: "json" };
import trade46 from "./46-trade.json" with { type: "json" };
import remittance47 from "./47-remittance.json" with { type: "json" };
import trade47 from "./47-trade.json" with { type: "json" };
import manifest from "./manifest.json" with { type: "json" };

export type ForeignExchangeAnswerKey = "A" | "B" | "C" | "D";
export type ForeignExchangeSubjectId = "remittance" | "trade";
export type ForeignExchangeSession = 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40 | 41 | 42 | 43 | 44 | 45 | 46 | 47;

export type ForeignExchangeQuestionRecord = {
  id: string;
  examId: "junior-foreign-exchange";
  bankId: string;
  bankTitle: string;
  chapter: string;
  question: string;
  options: Record<ForeignExchangeAnswerKey, string>;
  answer: ForeignExchangeAnswerKey;
  acceptedAnswers: ForeignExchangeAnswerKey[];
  allAnsweredCredit: boolean;
  automaticCredit: boolean;
  answerNote: string | null;
  explanation: string;
  explanationKind: string;
  sourceFile: string;
  sourcePath: string;
  sourcePdfSha256: string;
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
  remittance23,
  trade23,
  remittance24,
  trade24,
  remittance25,
  trade25,
  remittance26,
  trade26,
  remittance27,
  trade27,
  remittance28,
  trade28,
  remittance29,
  trade29,
  remittance30,
  trade30,
  remittance31,
  trade31,
  remittance32,
  trade32,
  remittance33,
  trade33,
  remittance34,
  trade34,
  remittance35,
  trade35,
  remittance36,
  trade36,
  remittance37,
  trade37,
  remittance38,
  trade38,
  remittance39,
  trade39,
  remittance40,
  trade40,
  remittance41,
  trade41,
  remittance42,
  trade42,
  remittance43,
  trade43,
  remittance44,
  trade44,
  remittance45,
  trade45,
  remittance46,
  trade46,
  remittance47,
  trade47
] as unknown as ForeignExchangeQuestionRecord[][];

export const foreignExchangeManifest = manifest;
export const foreignExchangeQuestions = shards.flat();
