import path from "node:path";
import { getBankId } from "./bank-id";

export type SourceFileMeta = {
  bankTitle: string;
  bankId: string;
  chapter: string;
  sourceFile: string;
};

export function parseSourceFileName(filePath: string): SourceFileMeta {
  const sourceFile = path.basename(filePath);
  const stem = sourceFile.replace(/\.docx$/i, "");
  const splitIndex = stem.lastIndexOf("-");
  if (splitIndex <= 0 || splitIndex >= stem.length - 1) {
    throw new Error(`DOCX filename must follow {bankTitle}-{chapter}.docx: ${sourceFile}`);
  }

  const bankTitle = stem.slice(0, splitIndex).trim();
  const chapter = stem.slice(splitIndex + 1).trim();
  if (!bankTitle || !chapter) {
    throw new Error(`DOCX filename has empty bank title or chapter: ${sourceFile}`);
  }

  return {
    bankTitle,
    bankId: getBankId(bankTitle),
    chapter,
    sourceFile
  };
}
