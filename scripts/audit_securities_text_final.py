#!/usr/bin/env python3
"""Final learner-facing anomaly audit for the scan-derived securities text bank.

This audit inspects only the text that can be rendered to learners. It does not
use, compare with, or import any external notes or question banks.
"""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
TEXT_PATH = ROOT / "build-data/securities-text-final.json"
RECON_PATH = ROOT / "docs/securities-text-reconciliation-audit.json"
REVIEW_PATH = ROOT / "docs/securities-text-full-review.json"
MANUAL_PATH = ROOT / "docs/securities-text-manual-overrides.json"
OUTPUT_PATH = ROOT / "docs/securities-text-final-anomaly-audit.json"

ANSWER_KEYS = ("1", "2", "3", "4")
HEX64 = re.compile(r"^[a-f0-9]{64}$")
PRINTED_QUESTION_NUMBER = re.compile(r"^\s*\)?\s*\d{1,4}\s*[.、．)]\s*")
ARITHMETIC_OCR_ONE = re.compile(
    r"(?<=[0-9A-Za-z\)\]％%元股債值產本利收貨益額率費用量價])"
    r"一"
    r"(?=[0-9A-Za-z\(\[％%元股債值產本利收貨益額率費用量價])"
)

PATTERNS: dict[str, re.Pattern[str]] = {
    "unsafe_unicode": re.compile(r"[\ufffd\x00]"),
    "control_character": re.compile(r"[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]"),
    "known_ocr_artifact": re.compile(
        r"三分之\s*-|衍生性\s*AA|不意調|有\s*0\s*時|"
        r"17,260元\s*30|5\.9%\s*100\.000|8\.08%\s*1\.000|"
        r"48\.8元\s*4|營業報\s*AA|年餘餘額|淨利一特別股股利|"
        r"流動資產一流動負債|銷貨收入一銷貨成本|本期進貨一期末存貨|"
        r"(?:組閤|適閤|另\+外|浮現值|銷貨收入浮額)|"
        r"(?:Coν|成本く淨變現價值|股東常會\s*4つ|IⅣ|資產週轉率次期股利|"
        r"3\.5 \$2\.000\.000|\$1\.22 \$40×|分散 48 單一|是 24 否|"
        r"認購權 24 利|十日前 33|將 46 應|二分 58 之一|至第三 0 他|"
        r"\(共19項\): 440|直線 409 法)"
    ),
    "page_artifact": re.compile(r"(?<![A-Za-z0-9])(?:24L|A10|L11)(?![A-Za-z0-9])"),
    "middle_dot_ocr": re.compile(r"·"),
    "double_equals": re.compile(r"=\s*[=;]"),
    "malformed_decimal": re.compile(r"\d+\.\d+\.\d+"),
    "internal_metadata": re.compile(
        r"\bOCR\b|confidence|SHA-?256|sha256|sourcePage|questionSegments|"
        r"explanationSegments|reviewStatus|裁切座標|信心值|模型名稱|"
        r"project-scan-pages-only|(?:^|[/\\])pdf-pages[/\\]",
        re.IGNORECASE,
    ),
    "forbidden_external_source": re.compile(
        r"JY電子檔|JY筆記|JY價值筆記|JY電子檔筆記", re.IGNORECASE
    ),
    "unresolved_cross_reference": re.compile(
        r"^\s*同(?:上|前|第).{0,15}題解析|同上題解析|同前題解析|參見上題|詳見上題"
    ),
    "japanese_ocr_glyph": re.compile(r"[\u3040-\u30ff]"),
    "arithmetic_ocr_one": ARITHMETIC_OCR_ONE,
    "internal_cjk_space": re.compile(r"(?<=[\u3400-\u9fff])[ \t]+(?=[\u3400-\u9fff])"),
    "leading_page_number_artifact": re.compile(
        r"^\s*\d{1,4}\s+(?=依|選項|本題|採|當|若|公司|證券|由|故|按|計算)"
    ),
    "joined_english_term": re.compile(
        r"CallOption|FundofFunds|YieldCurve|CallableBond|DiscountFactor|"
        r"BasisPoint|RepurchaseAgreement|TermStructure|IndexRate|"
        r"SmoothingMoving|SecondaryMoves|DirectionalMovement|DeclineRatio|"
        r"RetentionRatio|MarketPortfolio|Well-DiversifiedPortfolio|"
        r"LiquidityRisk|MomentumLife(?:Cycle| Cycle)|EfficientPortfolio|"
        r"BorrowingPosition|SmartBeta|JensenIndex|TrackingError|"
        r"Top-DownStrategy|HedgeFund|FeasibleSet|EfficientFrontier|"
        r"HighYield(?:Notes| Notes)|CurrentYield|UnrealizedForeign(?:Exchange| Exchange)|"
        r"RequiredRateofReturn|Required Rate ofReturn|LongCall|ShortCall|"
        r"FinancialPlanning|LayeringStage|OneTimePassword|MobileID|Managers'Index"
    ),
    "scan_verified_arithmetic_artifact": re.compile(r"現金收入一現金支出"),
}


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def add_issue(
    issues: dict[str, list[dict[str, str]]],
    kind: str,
    record_id: str,
    field: str,
    value: str,
    match: str = "",
) -> None:
    issues.setdefault(kind, []).append(
        {
            "id": record_id,
            "field": field,
            "match": match,
            "excerpt": value[:320],
        }
    )


def main() -> None:
    text_raw = TEXT_PATH.read_bytes()
    text_data: dict[str, Any] = json.loads(text_raw)
    recon: dict[str, Any] = json.loads(RECON_PATH.read_text(encoding="utf-8"))
    review: dict[str, Any] = json.loads(REVIEW_PATH.read_text(encoding="utf-8"))
    manual: dict[str, Any] = json.loads(MANUAL_PATH.read_text(encoding="utf-8"))

    records: list[dict[str, Any]] = text_data.get("items", [])
    issues: dict[str, list[dict[str, str]]] = {}
    seen: set[str] = set()
    bank_counts: Counter[str] = Counter()
    chapter_counts: Counter[str] = Counter()
    duplicate_option_questions = 0
    markdown_table_questions = 0

    if text_data.get("questionCount") != len(records):
        add_issue(
            issues,
            "root_question_count_mismatch",
            "<root>",
            "questionCount",
            str(text_data.get("questionCount")),
            str(len(records)),
        )
    if len(records) != 3526:
        add_issue(issues, "unexpected_question_count", "<root>", "items", str(len(records)))
    if text_data.get("source", "").find("project-scan-pages-only") < 0:
        add_issue(
            issues,
            "invalid_root_source",
            "<root>",
            "source",
            str(text_data.get("source", "")),
        )

    for record in records:
        record_id = str(record.get("id", ""))
        if not record_id:
            add_issue(issues, "missing_id", "<unknown>", "id", "")
            continue
        if record_id in seen:
            add_issue(issues, "duplicate_id", record_id, "id", record_id)
        seen.add(record_id)

        bank_id = str(record.get("bankId", ""))
        chapter_id = str(record.get("chapterId", ""))
        bank_counts[bank_id] += 1
        chapter_counts[f"{bank_id}/{chapter_id}"] += 1

        answer = str(record.get("answer", ""))
        if answer not in ANSWER_KEYS:
            add_issue(issues, "invalid_answer", record_id, "answer", answer)

        options = record.get("options")
        if not isinstance(options, dict):
            add_issue(issues, "invalid_options_object", record_id, "options", repr(options))
            options = {}
        if set(options) != set(ANSWER_KEYS):
            add_issue(
                issues,
                "invalid_option_keys",
                record_id,
                "options",
                repr(sorted(options)),
            )
        option_values = [str(options.get(key, "")) for key in ANSWER_KEYS]
        if len(set(option_values)) < 4:
            duplicate_option_questions += 1

        fields: list[tuple[str, str]] = [
            ("question", str(record.get("question", ""))),
            *((f"option{key}", str(options.get(key, ""))) for key in ANSWER_KEYS),
            ("explanation", str(record.get("explanation", ""))),
        ]
        if "\n|" in str(record.get("question", "")):
            markdown_table_questions += 1

        for field, value in fields:
            if not value:
                add_issue(issues, "empty_learner_field", record_id, field, value)
                continue
            if value != value.strip():
                add_issue(issues, "untrimmed_learner_field", record_id, field, value)
            for name, pattern in PATTERNS.items():
                match = pattern.search(value)
                if match:
                    add_issue(issues, name, record_id, field, value, match.group(0))

        question = str(record.get("question", ""))
        printed_match = PRINTED_QUESTION_NUMBER.search(question)
        if printed_match:
            add_issue(
                issues,
                "printed_question_number",
                record_id,
                "question",
                question,
                printed_match.group(0),
            )

        source = record.get("source")
        if not isinstance(source, dict):
            add_issue(issues, "missing_source_provenance", record_id, "source", repr(source))
        else:
            if source.get("kind") != "project-scan-pages-only":
                add_issue(
                    issues,
                    "invalid_source_kind",
                    record_id,
                    "source.kind",
                    str(source.get("kind", "")),
                )
            for field in ("questionSegmentsSha256", "explanationSegmentsSha256"):
                value = str(source.get(field, ""))
                if not HEX64.fullmatch(value):
                    add_issue(issues, "invalid_source_hash", record_id, f"source.{field}", value)

    current_sha = sha256(text_raw)
    if recon.get("outputSha256") != current_sha:
        add_issue(
            issues,
            "reconciliation_sha_mismatch",
            "<root>",
            "outputSha256",
            str(recon.get("outputSha256", "")),
            current_sha,
        )
    if recon.get("forbiddenExternalSourcesUsed") is not False:
        add_issue(
            issues,
            "forbidden_source_flag",
            "<root>",
            "forbiddenExternalSourcesUsed",
            repr(recon.get("forbiddenExternalSourcesUsed")),
        )

    manual_items = manual.get("items", {})
    review_items = review.get("items", [])
    review_ids = {str(item.get("id", "")) for item in review_items if isinstance(item, dict)}
    manual_ids = set(manual_items) if isinstance(manual_items, dict) else set()
    missing_review_overrides = sorted(review_ids - manual_ids)
    for record_id in missing_review_overrides:
        add_issue(
            issues,
            "high_risk_record_without_manual_override",
            record_id,
            "manualOverride",
            "missing",
        )

    issue_counts = {name: len(values) for name, values in sorted(issues.items())}
    total_anomalies = sum(issue_counts.values())
    report = {
        "version": 1,
        "source": "project-scan-pages-only",
        "input": str(TEXT_PATH.relative_to(ROOT)).replace("\\", "/"),
        "inputSha256": current_sha,
        "questionCount": len(records),
        "learnerFieldCount": len(records) * 6,
        "questionAndExplanationFieldCount": len(records) * 2,
        "optionFieldCount": len(records) * 4,
        "uniqueIdCount": len(seen),
        "bankCounts": dict(sorted(bank_counts.items())),
        "chapterCount": len(chapter_counts),
        "manualOverrideQuestionCount": len(manual_ids),
        "highRiskReviewQuestionCount": len(review_ids),
        "visualReviewQuestionCount": recon.get("totalVisualReviewQuestionCount"),
        "multiEngineConsensusQuestionCount": recon.get("multiEngineConsensusQuestionCount"),
        "scanPageCount": recon.get("scanPageCount"),
        "duplicateOptionTextQuestionCount": duplicate_option_questions,
        "markdownTableQuestionCount": markdown_table_questions,
        "issueCounts": issue_counts,
        "totalAnomalyCount": total_anomalies,
        "issues": issues,
        "passed": total_anomalies == 0,
        "forbiddenExternalSourcesUsed": False,
    }
    OUTPUT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({k: v for k, v in report.items() if k != "issues"}, ensure_ascii=False, indent=2))
    if total_anomalies:
        raise SystemExit(f"Final securities text anomaly audit found {total_anomalies} issue(s).")


if __name__ == "__main__":
    main()
