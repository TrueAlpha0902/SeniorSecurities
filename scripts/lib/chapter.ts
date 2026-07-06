import { safeSlug } from "./slug";

const CHAPTER_SLUGS: Record<string, string> = {
  "第一章": "ch01",
  "第二章": "ch02",
  "第三章": "ch03",
  "第四章": "ch04",
  "第五章": "ch05",
  "第六章": "ch06",
  "第七章": "ch07",
  "第八章": "ch08",
  "第九章": "ch09",
  "第十章": "ch10"
};

export function getChapterSlug(chapter: string): string {
  return CHAPTER_SLUGS[chapter] ?? safeSlug(chapter, "chapter");
}
