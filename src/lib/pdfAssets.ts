import { QUESTION_RELEASE_ID } from "../generated/questionRelease";
import { assetUrl } from "./imageQuiz";

export function pdfImageUrl(path: string, retryToken = 0): string {
  const url = assetUrl(path);
  const separator = url.includes("?") ? "&" : "?";
  const retry = retryToken > 0 ? `&retry=${retryToken}` : "";
  return `${url}${separator}v=${QUESTION_RELEASE_ID}${retry}`;
}
