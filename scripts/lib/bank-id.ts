import { safeSlug } from "./slug";

export const BANK_ID_MAPPINGS: Record<string, string> = {
  "投資學": "investment",
  "財務分析": "financial-analysis"
};

export function getBankId(bankTitle: string): string {
  return BANK_ID_MAPPINGS[bankTitle] ?? safeSlug(bankTitle, "bank");
}
