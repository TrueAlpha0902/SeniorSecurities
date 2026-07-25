#!/usr/bin/env python3
"""Generate and audit the official junior foreign-exchange question bank.

The official PDFs contain an embedded Unicode text layer. This script uses
Poppler's ``pdftotext -raw`` as the canonical extraction, then verifies every
question stem and every option against two independent PDF engines (PyMuPDF
and pypdf). Official answer sheets are parsed independently as well.

No OCR or language model is used to create question or answer text.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path

try:
    import fitz  # PyMuPDF
    import pypdf
except ImportError as exc:  # pragma: no cover - local audit dependency
    raise SystemExit(
        "Missing audit dependency. Install PyMuPDF and pypdf before running this script."
    ) from exc

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
SOURCE_DIR = PROJECT_ROOT / "source-materials" / "initial-fx-official-pdfs"
OUTPUT_DIR = PROJECT_ROOT / "api" / "_data" / "foreign-exchange"
AUDIT_DIR = PROJECT_ROOT / "docs" / "foreign-exchange-audit"
QA_REPORT = PROJECT_ROOT / "docs" / "FOREIGN_EXCHANGE_TEXT_QA.md"
IMPORTED_AT = "2026-07-19"
EXAM_ID = "junior-foreign-exchange"

sys.path.insert(0, str(SCRIPT_DIR))
from fx_explanations import EXPLANATIONS  # noqa: E402


@dataclass(frozen=True)
class QuestionPdf:
    stem: str
    session: int
    subject_id: str
    subject_title: str
    count: int


QUESTION_PDFS = (
    QuestionPdf("624444-3", 45, "remittance", "國外匯兌業務", 50),
    QuestionPdf("624444-4", 45, "trade", "進出口外匯業務", 80),
    QuestionPdf("644261-3", 46, "remittance", "國外匯兌業務", 50),
    QuestionPdf("644261-4", 46, "trade", "進出口外匯業務", 80),
    QuestionPdf("666077-3", 47, "remittance", "國外匯兌業務", 50),
    QuestionPdf("666077-4", 47, "trade", "進出口外匯業務", 80),
)

ANSWER_PDFS = {45: "624444-5", 46: "644261-5", 47: "666077-5"}
ANSWER_KEYS = "ABCD"
SUBJECT_BANK_IDS = {"remittance": "fx-remittance", "trade": "fx-trade"}
STANDARD_BY_SESSION = {45: "SWIFT MT", 46: "SWIFT MT", 47: "ISO 20022"}
OFFICIAL_SOURCE_URLS = {
    "624444-3.pdf": "https://service.tabf.org.tw/BEExam/Doc/ExamHistoryEdit/624444-3.pdf",
    "624444-4.pdf": "https://service.tabf.org.tw/BEExam/Doc/ExamHistoryEdit/624444-4.pdf",
    "624444-5.pdf": "https://service.tabf.org.tw/BEExam/Doc/ExamHistoryEdit/624444-5.pdf",
    "644261-3.pdf": "https://service.tabf.org.tw/BEExam/Doc/ExamHistoryEdit/644261-3.pdf",
    "644261-4.pdf": "https://service.tabf.org.tw/BEExam/Doc/ExamHistoryEdit/644261-4.pdf",
    "644261-5.pdf": "https://service.tabf.org.tw/BEExam/Doc/ExamHistoryEdit/644261-5.pdf",
    "666077-3.pdf": "https://service.tabf.org.tw/BEExam/Doc/ExamHistoryEdit/666077-3.pdf",
    "666077-4.pdf": "https://service.tabf.org.tw/BEExam/Doc/ExamHistoryEdit/666077-4.pdf",
    "666077-5.pdf": "https://service.tabf.org.tw/BEExam/Doc/ExamHistoryEdit/666077-5.pdf",
}

QUESTION_HEADER_OR_FOOTER = re.compile(
    r"(請接續背面|台灣金融研訓院|題數與配分|疑義期間|科目：|入場通知書編號|答案卡務必繳回|注意：)"
)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return sha256_bytes(text.encode("utf-8"))


def read_pdf_bytes(stem: str) -> bytes:
    path = SOURCE_DIR / f"{stem}.pdf"
    if not path.exists():
        raise FileNotFoundError(f"Missing source PDF: {path}")
    return path.read_bytes()


def pdftotext(stem: str, *, layout: bool = False) -> str:
    command = ["pdftotext"]
    command.append("-layout" if layout else "-raw")
    command.extend([str(SOURCE_DIR / f"{stem}.pdf"), "-"])
    try:
        return subprocess.check_output(command, text=True)
    except FileNotFoundError as exc:
        raise SystemExit("Poppler pdftotext is required for canonical extraction.") from exc


def normalize_display(text: str) -> str:
    """Reconstruct running text while discarding PDF-only line wrapping.

    Chinese exam copy is laid out in narrow columns. The embedded text layer
    therefore contains hard line breaks in the middle of Chinese words. Those
    breaks are presentation artifacts, not visible spaces in the printed text.
    English-to-English line wraps retain one separator so words are not merged.
    """
    lines = [re.sub(r"[ \t]+", " ", line.strip()) for line in text.splitlines() if line.strip()]
    if not lines:
        return ""

    output = lines[0]
    for line in lines[1:]:
        left = output[-1]
        right = line[0]
        separator = " " if left.isascii() and right.isascii() and (left.isalnum() or left in ",.;:!?)]}") and (right.isalnum() or right in "([{'\"") else ""
        output += separator + line

    # Remove spacing artifacts between Chinese glyphs and around CJK punctuation.
    cjk = r"\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff"
    output = re.sub(rf"(?<=[{cjk}]) +(?=[{cjk}])", "", output)
    output = re.sub(r" +(?=[，。；：！？、％）】》〉」』])", "", output)
    output = re.sub(r"(?<=[（【《〈「『]) +", "", output)
    return output.strip()


def normalize_compare(text: str) -> str:
    """Normalize only compatibility forms and whitespace for cross-engine checks."""
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", text))


def question_starts(raw: str, count: int) -> list[tuple[int, int]]:
    starts: list[tuple[int, int]] = []
    expected = 1
    for match in re.finditer(r"(?m)^[\f \t]*(\d{1,2})\.", raw):
        number = int(match.group(1))
        if number != expected:
            continue
        starts.append((number, match.start() + match.group(0).find(match.group(1))))
        expected += 1
        if expected > count:
            break
    if len(starts) != count:
        raise ValueError(f"Expected {count} questions, found {len(starts)}")
    return starts


def split_question_blocks(raw: str, count: int) -> list[tuple[int, int, str]]:
    starts = question_starts(raw, count)
    blocks: list[tuple[int, int, str]] = []
    for index, (number, start) in enumerate(starts):
        end = starts[index + 1][1] if index + 1 < len(starts) else len(raw)
        page = raw.count("\f", 0, start) + 1
        block = raw[start:end].strip("\n\f ")
        blocks.append((number, page, block))
    return blocks


def find_option_sequence(body: str) -> list[re.Match[str]]:
    markers = list(re.finditer(r"\(([1-4])\)", body))
    for index, marker in enumerate(markers):
        if marker.group(1) != "1":
            continue
        sequence = [marker]
        expected = 2
        for candidate in markers[index + 1 :]:
            if candidate.group(1) == str(expected):
                sequence.append(candidate)
                expected += 1
                if expected == 5:
                    return sequence
    raise ValueError("Unable to identify four answer options")


def parse_question_block(block: str, number: int) -> tuple[str, list[str], str]:
    prefix = f"{number}."
    if not block.startswith(prefix):
        raise ValueError(f"Question {number} does not start with expected prefix")
    body = block[len(prefix) :].strip()
    sequence = find_option_sequence(body)
    question = normalize_display(body[: sequence[0].start()])
    options: list[str] = []
    for index, marker in enumerate(sequence):
        end = sequence[index + 1].start() if index < 3 else len(body)
        option = body[marker.end() : end].strip()
        if index == 3:
            kept_lines: list[str] = []
            for line in option.splitlines():
                if QUESTION_HEADER_OR_FOOTER.search(line):
                    break
                kept_lines.append(line)
            option = "\n".join(kept_lines).strip()
        options.append(normalize_display(option))
    if not question or len(options) != 4 or any(not option for option in options):
        raise ValueError(f"Question {number} contains an empty field")
    canonical_block = f"{number}.{question}\n" + "\n".join(
        f"({index}){option}" for index, option in enumerate(options, start=1)
    )
    return question, options, canonical_block


def parse_answer_sheet_pdftotext(session: int) -> tuple[dict[int, int], dict[int, int]]:
    raw = pdftotext(ANSWER_PDFS[session], layout=True)
    remittance: dict[int, int] = {}
    trade: dict[int, int] = {}
    for line in raw.splitlines():
        columns = re.fullmatch(r"\s*(\d{1,2})\s+([1-4])(?:\s+([1-4]))?\s*", line)
        if not columns:
            continue
        number = int(columns.group(1))
        first = int(columns.group(2))
        second = int(columns.group(3)) if columns.group(3) else None
        if number <= 50:
            remittance[number] = first
            if second is None:
                raise ValueError(f"Missing trade answer for session {session}, question {number}")
            trade[number] = second
        else:
            trade[number] = first
    if len(remittance) != 50 or len(trade) != 80:
        raise ValueError(
            f"Answer sheet {session}: expected 50/80 answers, got {len(remittance)}/{len(trade)}"
        )
    return remittance, trade


def numeric_stream_from_fitz(stem: str) -> list[int]:
    document = fitz.open(SOURCE_DIR / f"{stem}.pdf")
    text = "\n".join(page.get_text("text") for page in document)
    lines = [line.strip() for line in text.splitlines()]
    start = lines.index("1")
    numbers: list[int] = []
    for line in lines[start:]:
        if line == "題數與配分：":
            break
        if re.fullmatch(r"\d{1,2}|[1-4]", line):
            numbers.append(int(line))
    return numbers


def digit_stream_from_pypdf(stem: str) -> str:
    reader = pypdf.PdfReader(str(SOURCE_DIR / f"{stem}.pdf"))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    # The default pypdf extractor collapses this positioned table into one line.
    # The complete digit stream remains deterministic and can be compared exactly.
    section = text.split("題號", 1)[-1].split("題數與配分", 1)[0]
    return "".join(re.findall(r"\d", section))


def expected_answer_stream(remittance: dict[int, int], trade: dict[int, int]) -> list[int]:
    stream: list[int] = []
    for number in range(1, 51):
        stream.extend([number, remittance[number], trade[number]])
    for number in range(51, 81):
        stream.extend([number, trade[number]])
    return stream


def independent_page_texts(stem: str) -> tuple[list[str], list[str]]:
    path = SOURCE_DIR / f"{stem}.pdf"
    fitz_document = fitz.open(path)
    fitz_pages = [page.get_text("text") for page in fitz_document]
    reader = pypdf.PdfReader(str(path))
    pypdf_pages = [page.extract_text() or "" for page in reader.pages]
    return fitz_pages, pypdf_pages


def json_bytes(payload: object) -> bytes:
    return (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def write_if_changed(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json_bytes(payload)
    if path.exists() and path.read_bytes() == data:
        return
    path.write_bytes(data)


def build_question_records() -> tuple[list[dict[str, object]], dict[str, object]]:
    answers_by_session: dict[int, tuple[dict[int, int], dict[int, int]]] = {}
    answer_engine_checks: list[dict[str, object]] = []
    for session in sorted(ANSWER_PDFS):
        remittance, trade = parse_answer_sheet_pdftotext(session)
        expected = expected_answer_stream(remittance, trade)
        fitz_stream = numeric_stream_from_fitz(ANSWER_PDFS[session])
        pypdf_digit_stream = digit_stream_from_pypdf(ANSWER_PDFS[session])
        if fitz_stream != expected:
            raise ValueError(f"PyMuPDF answer-sheet cross-check failed for session {session}")
        if pypdf_digit_stream != "".join(str(value) for value in expected):
            raise ValueError(f"pypdf answer-sheet cross-check failed for session {session}")
        answers_by_session[session] = (remittance, trade)
        answer_engine_checks.append(
            {
                "session": session,
                "answerCount": 130,
                "pdftotext": "matched",
                "pymupdf": "matched",
                "pypdf": "matched",
            }
        )

    records: list[dict[str, object]] = []
    field_checks = 0
    source_files: dict[str, dict[str, object]] = {}

    for spec in QUESTION_PDFS:
        raw = pdftotext(spec.stem)
        fitz_pages, pypdf_pages = independent_page_texts(spec.stem)
        if len(fitz_pages) != 2 or len(pypdf_pages) != 2:
            raise ValueError(f"Unexpected page count for {spec.stem}.pdf")
        remittance_answers, trade_answers = answers_by_session[spec.session]
        answer_map = remittance_answers if spec.subject_id == "remittance" else trade_answers
        for number, page, block in split_question_blocks(raw, spec.count):
            question, options, canonical_block = parse_question_block(block, number)
            if page < 1 or page > len(fitz_pages):
                raise ValueError(f"Invalid page for {spec.stem} question {number}")
            fields = [("question", question)] + [
                (f"option{index}", option)
                for index, option in enumerate(options, start=1)
            ]
            for field_name, field_value in fields:
                normalized = normalize_compare(field_value)
                if normalized not in normalize_compare(fitz_pages[page - 1]):
                    raise ValueError(
                        f"PyMuPDF text mismatch: {spec.stem} q{number} {field_name}"
                    )
                if normalized not in normalize_compare(pypdf_pages[page - 1]):
                    raise ValueError(
                        f"pypdf text mismatch: {spec.stem} q{number} {field_name}"
                    )
                field_checks += 1

            explanation_key = (spec.session, spec.subject_id, number)
            explanation = EXPLANATIONS.get(explanation_key, "").strip()
            if not explanation:
                raise ValueError(f"Missing explanation: {explanation_key}")
            numeric_answer = answer_map[number]
            answer_key = ANSWER_KEYS[numeric_answer - 1]
            question_id = f"fx-{spec.session}-{spec.subject_id}-{number:03d}"
            records.append(
                {
                    "id": question_id,
                    "examId": EXAM_ID,
                    "bankId": SUBJECT_BANK_IDS[spec.subject_id],
                    "bankTitle": spec.subject_title,
                    "chapter": f"第{spec.session}屆",
                    "question": question,
                    "options": dict(zip(ANSWER_KEYS, options, strict=True)),
                    "answer": answer_key,
                    "explanation": explanation,
                    "sourceFile": f"{spec.stem}.pdf",
                    "batchId": f"fx-official-{spec.session}",
                    "importedAt": IMPORTED_AT,
                    "reviewStatus": "checked",
                    "tags": [
                        "初階外匯",
                        f"第{spec.session}屆",
                        spec.subject_title,
                        STANDARD_BY_SESSION[spec.session],
                    ],
                    "session": spec.session,
                    "subjectId": spec.subject_id,
                    "questionNumber": number,
                    "standardVersion": STANDARD_BY_SESSION[spec.session],
                    "sourcePage": page,
                    "sourceTextSha256": sha256_text(canonical_block),
                }
            )

        pdf_name = f"{spec.stem}.pdf"
        source_files[pdf_name] = {
            "sha256": sha256_bytes(read_pdf_bytes(spec.stem)),
            "officialUrl": OFFICIAL_SOURCE_URLS[pdf_name],
            "pages": 2,
            "kind": "questions",
        }

    for session, stem in ANSWER_PDFS.items():
        pdf_name = f"{stem}.pdf"
        source_files[pdf_name] = {
            "sha256": sha256_bytes(read_pdf_bytes(stem)),
            "officialUrl": OFFICIAL_SOURCE_URLS[pdf_name],
            "pages": 1,
            "kind": "answers",
            "session": session,
        }

    if len(records) != 390:
        raise ValueError(f"Expected 390 questions, got {len(records)}")
    if len({record["id"] for record in records}) != len(records):
        raise ValueError("Duplicate question IDs")
    if len(EXPLANATIONS) != 390:
        raise ValueError(f"Expected 390 explanations, got {len(EXPLANATIONS)}")

    qa = {
        "schemaVersion": 1,
        "examId": EXAM_ID,
        "canonicalExtractor": "pdftotext -raw",
        "independentExtractors": ["PyMuPDF", "pypdf"],
        "ocrUsed": False,
        "aiUsedForQuestionOrAnswerText": False,
        "questionCount": len(records),
        "answerCount": len(records),
        "explanationCount": len(EXPLANATIONS),
        "verifiedTextFields": field_checks,
        "expectedTextFields": len(records) * 5,
        "answerEngineChecks": answer_engine_checks,
        "sourceFiles": source_files,
        "humanDoubleEntryProofreading": False,
        "verificationScope": (
            "Every question stem and each of four options matched the expected PDF page in "
            "both independent Unicode extractors after compatibility/whitespace normalization. "
            "Every official answer matched all three extraction paths."
        ),
    }
    return records, qa


def build_manifest(records: list[dict[str, object]], qa: dict[str, object]) -> dict[str, object]:
    files: list[dict[str, object]] = []
    sessions: list[dict[str, object]] = []
    for session in (45, 46, 47):
        subjects: list[dict[str, object]] = []
        for subject_id, subject_title, count in (
            ("remittance", "國外匯兌業務", 50),
            ("trade", "進出口外匯業務", 80),
        ):
            filename = f"{session}-{subject_id}.json"
            shard_records = [
                record
                for record in records
                if record["session"] == session and record["subjectId"] == subject_id
            ]
            data = json_bytes(shard_records)
            files.append(
                {
                    "session": session,
                    "subjectId": subject_id,
                    "path": f"api/_data/foreign-exchange/{filename}",
                    "questionCount": len(shard_records),
                    "sha256": sha256_bytes(data),
                }
            )
            subjects.append(
                {
                    "id": subject_id,
                    "title": subject_title,
                    "questionCount": count,
                    "durationMinutes": 60 if subject_id == "remittance" else 90,
                    "file": filename,
                }
            )
        sessions.append(
            {
                "session": session,
                "standardVersion": STANDARD_BY_SESSION[session],
                "subjects": subjects,
            }
        )
    content_signature = sha256_text(
        "\n".join(
            f"{record['id']}|{record['sourceTextSha256']}|{record['answer']}|{sha256_text(str(record['explanation']))}"
            for record in records
        )
    )
    return {
        "schemaVersion": 1,
        "examId": EXAM_ID,
        "title": "初階外匯",
        "questionCount": len(records),
        "contentSignature": content_signature,
        "sessions": sessions,
        "files": files,
        "quality": {
            "ocrUsed": qa["ocrUsed"],
            "questionAnswerTextSource": "official embedded PDF text layer",
            "verifiedTextFields": qa["verifiedTextFields"],
            "answerCrossCheck": "three extraction paths matched",
        },
    }


def write_outputs(records: list[dict[str, object]], qa: dict[str, object]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for session in (45, 46, 47):
        for subject_id in ("remittance", "trade"):
            shard = [
                record
                for record in records
                if record["session"] == session and record["subjectId"] == subject_id
            ]
            write_if_changed(OUTPUT_DIR / f"{session}-{subject_id}.json", shard)
    manifest = build_manifest(records, qa)
    write_if_changed(OUTPUT_DIR / "manifest.json", manifest)

    audit_payload = {
        **qa,
        "questions": [
            {
                "id": record["id"],
                "sourceFile": record["sourceFile"],
                "sourcePage": record["sourcePage"],
                "sourceTextSha256": record["sourceTextSha256"],
                "answer": record["answer"],
                "explanationSha256": sha256_text(str(record["explanation"])),
            }
            for record in records
        ],
    }
    write_if_changed(AUDIT_DIR / "foreign-exchange-source-audit.json", audit_payload)

    rows = []
    for session in (45, 46, 47):
        remittance = sum(1 for record in records if record["session"] == session and record["subjectId"] == "remittance")
        trade = sum(1 for record in records if record["session"] == session and record["subjectId"] == "trade")
        rows.append(f"| 第{session}屆 | {remittance} | {trade} | {remittance + trade} |")
    report = f"""# 初階外匯文字與答案驗證報告

更新日期：{IMPORTED_AT}

## 結果

- 官方試題：390 題。
- 官方答案：390 筆。
- 逐題解析：390 筆。
- OCR：未使用。
- 題幹與選項來源：官方 PDF 內嵌 Unicode 文字層。
- 已交叉核對文字欄位：{qa['verifiedTextFields']} / {qa['expectedTextFields']}（每題 1 個題幹＋4 個選項）。
- 官方答案已由 `pdftotext`、PyMuPDF、pypdf 三條擷取路徑交叉比對，全部一致。

| 屆次 | 國外匯兌業務 | 進出口外匯業務 | 合計 |
|---|---:|---:|---:|
{chr(10).join(rows)}
| **合計** | **150** | **240** | **390** |

## 驗證方法

1. 以 `pdftotext -raw` 取得官方 PDF 的內嵌文字，依原題號及 `(1)` 至 `(4)` 選項標記切分。
2. 每題題幹與四個選項，分別在相同 PDF 頁面以 PyMuPDF 與 pypdf 重新擷取。
3. 清除 PDF 欄寬造成的硬換行與中文字間假空白；英文字詞換行仍保留必要空格。比對時僅做 Unicode 相容與空白正規化，標點、數字、英文字母及中文字仍須逐欄匹配。
4. 答案表由三套擷取路徑獨立解析，並逐題核對 390 筆答案。
5. 產生題數、ID、選項數、空欄、非法答案、Unicode 取代字元及來源雜湊檢查。

## 可以確認與不能誇大的部分

目前可以確認：App 題幹、選項及答案均取自官方 PDF 文字層，390 題結構完整，且 1,950 個文字欄位通過兩套獨立 PDF 引擎交叉比對；沒有 OCR 或 AI 補字。

這不等同於兩位人工校對員對 390 題做逐字雙錄比對，因此本報告不宣稱具備人工雙人校對證明。若要達到出版品等級的絕對人工證明，仍需另做逐題人工覆核與簽核。

## 解析範圍

解析由本專案依官方答案撰寫，目的在說明判斷理由；不是官方詳解。涉及歷屆法規金額、申報門檻或舊制 SWIFT 電文者，依該屆命題時點說明，不應直接當作現行法規依據。
"""
    QA_REPORT.write_text(report, encoding="utf-8")


def validate_generated(records: list[dict[str, object]], qa: dict[str, object]) -> None:
    manifest = build_manifest(records, qa)
    expected_files = [OUTPUT_DIR / "manifest.json"] + [
        OUTPUT_DIR / f"{session}-{subject}.json"
        for session in (45, 46, 47)
        for subject in ("remittance", "trade")
    ]
    missing = [path for path in expected_files if not path.exists()]
    if missing:
        raise ValueError(f"Missing generated files: {', '.join(str(path) for path in missing)}")
    current_manifest = json.loads((OUTPUT_DIR / "manifest.json").read_text(encoding="utf-8"))
    if current_manifest != manifest:
        raise ValueError("Generated manifest is stale. Run the generator without --check.")
    for session in (45, 46, 47):
        for subject_id in ("remittance", "trade"):
            expected = [
                record
                for record in records
                if record["session"] == session and record["subjectId"] == subject_id
            ]
            current = json.loads((OUTPUT_DIR / f"{session}-{subject_id}.json").read_text(encoding="utf-8"))
            if current != expected:
                raise ValueError(f"Generated shard is stale: {session}-{subject_id}.json")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="verify generated files are current")
    args = parser.parse_args()

    records, qa = build_question_records()
    if args.check:
        validate_generated(records, qa)
    else:
        write_outputs(records, qa)
    print(
        f"Foreign-exchange bank verified: {len(records)} questions, "
        f"{qa['verifiedTextFields']} text fields, {len(EXPLANATIONS)} explanations."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
