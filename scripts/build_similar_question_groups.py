from __future__ import annotations

import itertools
import json
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
TEXT_FILE = ROOT / "build-data" / "securities-text-final.json"
OUTPUT_FILE = ROOT / "public" / "data" / "similar-question-groups.json"
AUDIT_FILE = ROOT / "docs" / "similar-question-groups-audit.json"

PUNCT_PATTERN = re.compile(
    r"[\s,，。．、；;：:？！!?（）()\[\]［］{}【】<>《》「」『』\-—_\/／%％'\"`~|]+"
)
NUMBER_PATTERN = re.compile(
    r"(?<![A-Za-z])(?:\d+(?:\.\d+)?|[一二三四五六七八九十百千萬億]+)(?:％|%)?"
)


@dataclass(frozen=True)
class Question:
    id: str
    bank_id: str
    bank_title: str
    chapter_id: str
    chapter_title: str
    number: int
    question: str
    options: dict[str, str]


# Every pair below was inspected against the complete question and four options.
# Deliberately excluded: identical duplicates with no condition or option change,
# generic stems whose option sets cover unrelated concepts, and image-layout-only
# matches. This makes the learner index conservative by design.
REVIEWED_GROUPS: tuple[dict[str, Any], ...] = (
    {
        "questionIds": ("financial-analysis-ch01-pdf-0049", "financial-analysis-ch01-pdf-0063"),
        "matchType": "same-stem",
        "reason": "題幹與考點相同，選項順序不同；要辨認跨期金額變動才屬於動態分析。",
        "contrastTerms": ("選項順序", "跨期金額變動"),
    },
    {
        "questionIds": ("investment-ch03-pdf-0021", "investment-ch03-pdf-0057"),
        "matchType": "same-stem",
        "reason": "題幹相同，現金股利與股票股利的選項順序互換。",
        "contrastTerms": ("現金股利", "股票股利", "選項順序"),
    },
    {
        "questionIds": ("investment-ch02-pdf-0031", "investment-ch02-pdf-0068"),
        "matchType": "same-stem",
        "reason": "四個敘述幾乎相同，重點都是存續期間與利率風險的關係。",
        "contrastTerms": ("存續期間", "利率風險", "文字細節"),
    },
    {
        "questionIds": ("investment-ch05-pdf-0092", "investment-ch05-pdf-0154"),
        "matchType": "near-duplicate",
        "reason": "核心敘述相同，差別集中在市價淨值比的縮寫與少數選項文字。",
        "contrastTerms": ("市價淨值比", "縮寫", "選項文字"),
    },
    {
        "questionIds": ("securities-trading-regulations-ch02-pdf-0006", "securities-trading-regulations-ch02-pdf-0007"),
        "matchType": "same-concept",
        "reason": "計算基礎與選項相同，唯一關鍵是擔保公司債與無擔保公司債。",
        "contrastTerms": ("擔保公司債", "無擔保公司債"),
    },
    {
        "questionIds": ("securities-trading-practice-ch03-pdf-0038", "securities-trading-practice-ch03-pdf-0039"),
        "matchType": "near-duplicate",
        "reason": "同一批公司與同一時程架構，差別在資訊揭露與確信資訊揭露。",
        "contrastTerms": ("資訊揭露", "確信資訊揭露"),
    },
    {
        "questionIds": ("investment-ch03-pdf-0001", "investment-ch03-pdf-0013"),
        "matchType": "numeric-variant",
        "reason": "同一股利零成長模型，只替換必要報酬率與答案數值。",
        "contrastTerms": ("必要報酬率", "股利零成長", "答案數值"),
    },
    {
        "questionIds": ("securities-trading-practice-ch09-pdf-0069", "securities-trading-practice-ch09-pdf-0070"),
        "matchType": "near-duplicate",
        "reason": "規範與問法幾乎相同，差別在候選的外國有價證券種類。",
        "contrastTerms": ("投資範圍", "商品種類"),
    },
    {
        "questionIds": ("securities-trading-practice-ch03-pdf-0036", "securities-trading-practice-ch03-pdf-0037"),
        "matchType": "near-duplicate",
        "reason": "同為全體上市櫃公司的完成期限，差別在盤查資訊與確信資訊。",
        "contrastTerms": ("盤查資訊", "確信資訊", "完成期限"),
    },
    {
        "questionIds": ("securities-trading-practice-ch09-pdf-0038", "securities-trading-practice-ch09-pdf-0039"),
        "matchType": "numeric-variant",
        "reason": "使用相同的五檔價量架構，差別在市價買入與市價賣出的成交方向。",
        "contrastTerms": ("市價買入", "市價賣出", "成交方向"),
    },
    {
        "questionIds": ("investment-ch01-pdf-0063", "investment-ch01-pdf-0106"),
        "matchType": "near-duplicate",
        "reason": "PMI背景敘述相同，必須比較發布單位與調查範圍等選項差異。",
        "contrastTerms": ("發布單位", "調查範圍", "PMI"),
    },
    {
        "questionIds": ("investment-ch01-pdf-0090", "investment-ch01-pdf-0103"),
        "matchType": "same-stem",
        "reason": "都考普通股不具備的權利，但兩題提供的候選特性不同。",
        "contrastTerms": ("普通股權利", "優先權", "候選特性"),
    },
    {
        "questionIds": ("investment-ch05-pdf-0090", "investment-ch05-pdf-0112"),
        "matchType": "same-concept",
        "reason": "都要求判斷保守投資人適合的股票，差別在估值指標的表達方式。",
        "contrastTerms": ("保守投資人", "價值型股票", "估值指標"),
    },
    {
        "questionIds": ("securities-trading-practice-ch10-pdf-0012", "securities-trading-practice-ch10-pdf-0013"),
        "matchType": "same-stem",
        "reason": "題幹完全相同，但兩題列出的上櫃必要條件不同。",
        "contrastTerms": ("創投公司", "上櫃條件", "選項內容"),
    },
    {
        "questionIds": ("securities-trading-practice-ch10-pdf-0057", "securities-trading-practice-ch10-pdf-0058"),
        "matchType": "same-stem",
        "reason": "都考櫃檯買賣交易原則，兩題以不同敘述測試同一規範範圍。",
        "contrastTerms": ("櫃檯買賣", "交易原則", "錯誤敘述"),
    },
    {
        "questionIds": ("investment-ch03-pdf-0046", "investment-ch03-pdf-0058"),
        "matchType": "numeric-variant",
        "reason": "同一永續年金現值公式，只替換每年給付與年利率。",
        "contrastTerms": ("永續年金", "每年給付", "年利率"),
    },
    {
        "questionIds": ("investment-ch06-pdf-0002", "investment-ch06-pdf-0050"),
        "matchType": "numeric-variant",
        "reason": "同一機率加權期望報酬率題型，只替換報酬率與機率。",
        "contrastTerms": ("期望報酬率", "報酬率", "機率"),
    },
    {
        "questionIds": ("investment-ch04-pdf-0120", "investment-ch04-pdf-0121"),
        "matchType": "numeric-variant",
        "reason": "都使用上漲與下跌家數判斷騰落指標，必須先分清ADR與ADL公式。",
        "contrastTerms": ("ADR", "ADL", "上漲與下跌家數"),
    },
    {
        "questionIds": ("investment-ch02-pdf-0032", "investment-ch02-pdf-0127"),
        "matchType": "numeric-variant",
        "reason": "同一可轉換公司債轉換價值公式，只替換面額與市價。",
        "contrastTerms": ("轉換價值", "面額", "股票市價"),
    },
)


def normalize_text(value: str) -> str:
    return PUNCT_PATTERN.sub("", value.strip().lower())


def template_text(value: str) -> str:
    return NUMBER_PATTERN.sub("數值", normalize_text(value))


def load_questions() -> dict[str, Question]:
    data = json.loads(TEXT_FILE.read_text(encoding="utf-8"))
    result: dict[str, Question] = {}
    for item in data["items"]:
        options = {str(key): str(value).strip() for key, value in (item.get("options") or {}).items()}
        if len(options) != 4:
            continue
        question = Question(
            id=str(item["id"]),
            bank_id=str(item["bankId"]),
            bank_title=str(item["bankTitle"]),
            chapter_id=str(item["chapterId"]),
            chapter_title=str(item["chapterTitle"]),
            number=int(item["number"]),
            question=str(item.get("question") or "").strip(),
            options=options,
        )
        result[question.id] = question
    return result


def option_similarity(left: Question, right: Question) -> float:
    left_options = [normalize_text(left.options[str(index)]) for index in range(1, 5)]
    right_options = [normalize_text(right.options[str(index)]) for index in range(1, 5)]
    best = 0.0
    for permutation in itertools.permutations(range(4)):
        candidate = sum(
            SequenceMatcher(None, left_options[index], right_options[permutation[index]]).ratio()
            for index in range(4)
        ) / 4
        best = max(best, candidate)
    return best


def pair_similarity(left: Question, right: Question) -> tuple[float, dict[str, float]]:
    stem = SequenceMatcher(None, normalize_text(left.question), normalize_text(right.question)).ratio()
    template = SequenceMatcher(None, template_text(left.question), template_text(right.question)).ratio()
    options = option_similarity(left, right)
    # Stem similarity is intentionally dominant. Options remain important so a
    # generic stem cannot pass merely because it appears in the same chapter.
    score = 0.52 * stem + 0.24 * template + 0.24 * options
    return score, {
        "stem": round(stem, 4),
        "template": round(template, 4),
        "options": round(options, 4),
    }


def main() -> None:
    lookup = load_questions()
    groups: list[dict[str, Any]] = []
    audit_groups: list[dict[str, Any]] = []
    used_ids: set[str] = set()

    for index, spec in enumerate(REVIEWED_GROUPS, start=1):
        question_ids = tuple(spec["questionIds"])
        if len(question_ids) != 2:
            raise ValueError(f"Reviewed group {index} must contain exactly two questions")
        if any(question_id in used_ids for question_id in question_ids):
            raise ValueError(f"Question reused across reviewed groups: {question_ids}")
        try:
            left, right = (lookup[question_id] for question_id in question_ids)
        except KeyError as error:
            raise ValueError(f"Reviewed question no longer exists: {error.args[0]}") from error
        if left.bank_id != right.bank_id or left.chapter_id != right.chapter_id:
            raise ValueError(f"Reviewed pair crosses bank or chapter: {question_ids}")

        similarity, metrics = pair_similarity(left, right)
        # A reviewed pair must still satisfy a measurable high-similarity floor;
        # manual review never bypasses the structural guardrail.
        if similarity < 0.80:
            raise ValueError(
                f"Reviewed pair fell below the structural threshold ({similarity:.4f}): {question_ids}"
            )

        group = {
            "id": f"{left.bank_id}-{left.chapter_id}-reviewed-{index:03d}",
            "bankId": left.bank_id,
            "bankTitle": left.bank_title,
            "chapterId": left.chapter_id,
            "chapterTitle": left.chapter_title,
            "score": round(1 - similarity, 4),
            "similarity": round(similarity, 4),
            "matchType": spec["matchType"],
            "reviewed": True,
            "reason": spec["reason"],
            "contrastTerms": list(spec["contrastTerms"]),
            "questionIds": list(question_ids),
        }
        groups.append(group)
        audit_groups.append({
            **group,
            "metrics": metrics,
            "questions": [
                {
                    "id": question.id,
                    "number": question.number,
                    "question": question.question,
                    "options": question.options,
                }
                for question in (left, right)
            ],
        })
        used_ids.update(question_ids)

    groups.sort(key=lambda group: (group["bankTitle"], group["chapterTitle"], group["id"]))
    payload = {
        "version": 4,
        "method": "manually-reviewed-high-precision-pairs-v4",
        "groupCount": len(groups),
        "groups": groups,
    }
    OUTPUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    audit = {
        "questionCount": len(lookup),
        "reviewedPairCount": len(groups),
        "groupedQuestionCount": len(used_ids),
        "excludedExactDuplicatePolicy": "Identical questions with no meaningful condition or option difference are excluded.",
        "reviewRules": [
            "same bank and chapter",
            "complete question and four options inspected",
            "generic stems require matching option content",
            "opposite or unrelated targets are excluded",
            "each question may belong to only one reviewed pair",
        ],
        "groups": audit_groups,
    }
    AUDIT_FILE.write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(groups)} manually reviewed groups covering {len(used_ids)} questions.")


if __name__ == "__main__":
    main()
