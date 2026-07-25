#!/usr/bin/env python3
"""Generate and audit the junior foreign-exchange archive (sessions 23-47).

Question and option text comes only from the embedded Unicode text layer in the
source PDFs. Poppler, PyMuPDF and pypdf are cross-checked. Session 36 trade has
missing option-marker Unicode mappings; its visible text is segmented from PDF
coordinates and the printed marker pixels, without OCR.
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
from typing import Any

try:
    import fitz  # PyMuPDF
    import pypdf
    from PIL import Image
    import numpy as np
except ImportError as exc:  # pragma: no cover
    raise SystemExit("Missing PDF audit dependencies: PyMuPDF, pypdf, Pillow, numpy") from exc

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
SOURCE_DIR = PROJECT_ROOT / "source-materials" / "foreign-exchange-official-pdfs"
OUTPUT_DIR = PROJECT_ROOT / "api" / "_data" / "foreign-exchange"
AUDIT_DIR = PROJECT_ROOT / "docs" / "foreign-exchange-audit"
QA_REPORT = PROJECT_ROOT / "docs" / "FOREIGN_EXCHANGE_TEXT_QA.md"
IMPORTED_AT = "2026-07-20"
EXAM_ID = "junior-foreign-exchange"
ANSWER_KEYS = "ABCD"
SUBJECT_BANK_IDS = {"remittance": "fx-remittance", "trade": "fx-trade"}
SUBJECT_TITLES = {"remittance": "國外匯兌業務", "trade": "進出口外匯業務"}

sys.path.insert(0, str(SCRIPT_DIR))
from fx_explanations import EXPLANATIONS  # noqa: E402


@dataclass(frozen=True)
class QuestionPdf:
    session: int
    subject_id: str
    filename: str
    count: int


@dataclass(frozen=True)
class SessionFiles:
    remittance: str
    trade: str
    answers: str


SESSION_FILES: dict[int, SessionFiles] = {
    session: SessionFiles(
        f"{session}-remittance.pdf",
        f"{session}-trade.pdf",
        f"{session}-answers.pdf",
    )
    for session in range(23, 48)
}

QUESTION_PDFS = tuple(
    spec
    for session, files in SESSION_FILES.items()
    for spec in (
        QuestionPdf(session, "remittance", files.remittance, 50),
        QuestionPdf(session, "trade", files.trade, 80),
    )
)

STANDARD_BY_SESSION = {session: ("ISO 20022" if session == 47 else "SWIFT MT") for session in SESSION_FILES}

# Official answer exceptions visible in the answer PDFs.
SCORING_EXCEPTIONS: dict[tuple[int, str, int], dict[str, Any]] = {
    (28, "remittance", 48): {"accepted": ["C", "D"], "note": "選項（3）或（4）均予計分"},
    (31, "trade", 69): {"all_answered": True, "note": "凡有作答一律給分"},
    (32, "remittance", 49): {"all_answered": True, "note": "無正確答案；凡有作答均予計分"},
    (32, "trade", 74): {"accepted": ["B", "C", "D"], "note": "選項（2）、（3）或（4）均予計分"},
    (35, "remittance", 48): {"accepted": ["A", "B", "C", "D"], "note": "選項（1）至（4）均予計分"},
    (38, "remittance", 1): {"automatic": True, "note": "一律給分"},
}

QUESTION_HEADER_OR_FOOTER = re.compile(
    r"(請接續背面|台灣金融研訓院|題數與配分|疑義期間|科目：|入場通知書(?:編號|號碼)|答案卡務必繳回|注意：)"
)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return sha256_bytes(text.encode("utf-8"))


def source_path(session: int, filename: str) -> Path:
    path = SOURCE_DIR / str(session) / filename
    if not path.exists():
        raise FileNotFoundError(f"Missing source PDF: {path}")
    return path


def pdftotext_path(path: Path, *, layout: bool = False) -> str:
    command = ["pdftotext", "-layout" if layout else "-raw", str(path), "-"]
    try:
        command = list(command)
        if "-enc" not in command:
            command[1:1] = ["-enc", "UTF-8"]
        output = subprocess.check_output(command)
        return output.decode("utf-8-sig")
    except FileNotFoundError as exc:
        raise SystemExit("Poppler pdftotext is required.") from exc


def normalize_display(text: str) -> str:
    lines = [re.sub(r"[ \t]+", " ", line.strip()) for line in text.splitlines() if line.strip()]
    if not lines:
        return ""
    output = lines[0]
    for line in lines[1:]:
        left = output[-1]
        right = line[0]
        separator = (
            " "
            if left.isascii()
            and right.isascii()
            and (left.isalnum() or left in ",.;:!?)]}")
            and (right.isalnum() or right in "([{'\"")
            else ""
        )
        output += separator + line
    cjk = r"\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff"
    output = re.sub(rf"(?<=[{cjk}]) +(?=[{cjk}])", "", output)
    output = re.sub(r" +(?=[，。；：！？、％）】》〉」』])", "", output)
    output = re.sub(r"(?<=[（【《〈「『]) +", "", output)
    output = re.sub(r"\s+([,.;:!?])", r"\1", output)
    return output.strip()


def normalize_compare(text: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", text))


def question_starts(raw: str, count: int) -> list[tuple[int, int, int]]:
    starts: list[tuple[int, int, int]] = []
    expected = 1
    for match in re.finditer(r"(?m)^[\f \t]*(\d{1,2})\.", raw):
        number = int(match.group(1))
        if number != expected:
            continue
        start = match.start() + match.group(0).find(match.group(1))
        starts.append((number, start, raw.count("\f", 0, start) + 1))
        expected += 1
        if expected > count:
            break
    if len(starts) != count:
        raise ValueError(f"Expected {count} questions, found {len(starts)}")
    return starts


def split_question_blocks(raw: str, count: int) -> list[tuple[int, int, str]]:
    starts = question_starts(raw, count)
    blocks: list[tuple[int, int, str]] = []
    for index, (number, start, page) in enumerate(starts):
        end = starts[index + 1][1] if index + 1 < len(starts) else len(raw)
        blocks.append((number, page, raw[start:end].strip("\n\f ")))
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


def parse_question_block(block: str, number: int, session: int, subject_id: str) -> tuple[str, list[str], str]:
    prefix = f"{number}."
    if not block.startswith(prefix):
        raise ValueError(f"Question {number} does not start with expected prefix")
    body = block[len(prefix) :].strip()

    # One PDF text layer omitted the right parenthesis after option 2.
    if (session, subject_id, number) == (42, "trade", 72):
        question = "下列何者非屬 Factor 之功能？"
        options = ["開狀", "融資", "債權管理", "催收"]
    else:
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
        raise ValueError(f"Question {session}/{subject_id}/{number} contains an empty field")
    canonical_block = f"{number}.{question}\n" + "\n".join(
        f"({index}){option}" for index, option in enumerate(options, start=1)
    )
    return question, options, canonical_block


def marker_score(image: np.ndarray, line: dict[str, float | str], zoom: float) -> int:
    x0 = max(0, int((float(line["x0"]) - 16) * zoom))
    x1 = max(x0 + 1, int((float(line["x0"]) - 1) * zoom))
    y0 = max(0, int((float(line["y0"]) - 1) * zoom))
    y1 = min(image.shape[0], int((float(line["y1"]) + 2) * zoom))
    return int((image[y0:y1, x0:x1] < 180).sum())


def parse_session36_trade(path: Path) -> list[tuple[int, int, str, list[str], str]]:
    """Segment visible option text using PDF coordinates and printed marker pixels.

    The PDF's option-number font lacks a Unicode mapping. The visible option text
    remains native PDF text; marker pixels only identify option starts.
    """
    document = fitz.open(path)
    parsed: dict[int, tuple[int, str, list[str], str]] = {}
    zoom = 3.0

    for page_index, page in enumerate(document):
        payload = page.get_text("dict")
        lines: list[dict[str, float | str]] = []
        for block in payload["blocks"]:
            if "lines" not in block:
                continue
            for line in block["lines"]:
                text = "".join(span["text"] for span in line["spans"]).strip()
                if not text:
                    continue
                rect = fitz.Rect(line["bbox"])
                lines.append({"x0": rect.x0, "y0": rect.y0, "x1": rect.x1, "y1": rect.y1, "text": text})

        question_starts_on_page: list[dict[str, Any]] = []
        for line in lines:
            match = re.match(r"^(\d{1,2})\.\s*(.*)", str(line["text"]))
            x0 = float(line["x0"])
            if match and (x0 < 100 or 580 < x0 < 650):
                question_starts_on_page.append(
                    {"number": int(match.group(1)), "line": line, "first_stem": match.group(2)}
                )

        pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        gray = np.array(Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples).convert("L"))

        for start in question_starts_on_page:
            number = int(start["number"])
            start_line = start["line"]
            right_column = float(start_line["x0"]) > 500
            following = [
                candidate
                for candidate in question_starts_on_page
                if (float(candidate["line"]["x0"]) > 500) == right_column
                and float(candidate["line"]["y0"]) > float(start_line["y0"])
            ]
            end_y = min(
                (float(candidate["line"]["y0"]) for candidate in following),
                default=page.rect.height,
            )
            relevant = [
                line
                for line in lines
                if float(line["y0"]) >= float(start_line["y0"]) - 0.5
                and float(line["y0"]) < end_y - 0.3
                and (float(line["x0"]) > 500) == right_column
            ]
            relevant.sort(key=lambda item: (round(float(item["y0"]), 1), float(item["x0"])))

            stem_lines: list[str] = []
            options: list[str] = []
            current_option: int | None = None
            for index, line in enumerate(relevant):
                text = str(line["text"]).strip()
                if index == 0:
                    stem_lines.append(re.sub(r"^\d{1,2}\.\s*", "", text))
                    continue
                is_option_start = marker_score(gray, line, zoom) > 100
                if is_option_start:
                    options.append(text)
                    current_option = len(options) - 1
                elif current_option is None:
                    if "請接續背面" not in text:
                        stem_lines.append(text)
                elif "請接續背面" not in text:
                    options[current_option] += " " + text

            question = normalize_display("\n".join(stem_lines))
            options = [normalize_display(option) for option in options]
            if len(options) != 4:
                raise ValueError(f"Session 36 trade q{number}: expected 4 marker groups, got {len(options)}")
            canonical_block = f"{number}.{question}\n" + "\n".join(
                f"({index}){option}" for index, option in enumerate(options, start=1)
            )
            parsed[number] = (page_index + 1, question, options, canonical_block)

    if sorted(parsed) != list(range(1, 81)):
        raise ValueError("Session 36 trade coordinate parser did not produce questions 1-80")
    return [(number, *parsed[number]) for number in range(1, 81)]



def answer_sheet_has_section_headings(text: str) -> bool:
    return bool(
        re.search(r"科目：\s*國外匯兌業務", text)
        and re.search(r"科目：\s*進出口外匯業務", text)
    )


def answer_token_stream(text: str) -> str:
    normalized = text.replace("一律給分", "*")
    return "".join(re.findall(r"[0-9*]+", normalized))


def expected_answer_stream(
    remittance: dict[int, str],
    trade: dict[int, str],
    *,
    section_style: bool,
) -> str:
    if section_style:
        return "".join(f"{number}{remittance[number]}" for number in range(1, 51)) + "".join(
            f"{number}{trade[number]}" for number in range(1, 81)
        )
    return "".join(
        f"{number}{remittance[number]}{trade[number]}" for number in range(1, 51)
    ) + "".join(f"{number}{trade[number]}" for number in range(51, 81))


def verify_answer_text(
    text: str,
    remittance: dict[int, str],
    trade: dict[int, str],
    *,
    section_style: bool,
    engine_name: str,
    session: int,
) -> None:
    if section_style:
        try:
            before, after = re.split(r"科目：\s*進出口外匯業務", text, maxsplit=1)
            remittance_section = re.split(r"科目：\s*國外匯兌業務", before, maxsplit=1)[-1]
        except ValueError as exc:
            raise ValueError(
                f"{engine_name} answer headings missing for session {session}"
            ) from exc
        remittance_expected = "".join(
            f"{number}{remittance[number]}" for number in range(1, 51)
        )
        trade_expected = "".join(f"{number}{trade[number]}" for number in range(1, 81))
        if (
            remittance_expected not in answer_token_stream(remittance_section)
            or trade_expected not in answer_token_stream(after)
        ):
            raise ValueError(
                f"{engine_name} answer text mismatch for session {session}: "
                f"one or more official answer sections were not found"
            )
        return

    expected = expected_answer_stream(remittance, trade, section_style=False)
    actual = answer_token_stream(text)
    if expected not in actual:
        raise ValueError(
            f"{engine_name} answer text mismatch for session {session}: "
            f"expected official answer table sequence was not found"
        )

def parse_answer_text(text: str, session: int) -> tuple[dict[int, str], dict[int, str]]:
    # Sessions with prose answer sections use explicit "科目：..." headings.
    # Later two-column answer tables also contain the subject names, but only in
    # headers such as "第一節-國外匯兌業務"; do not misclassify those tables.
    has_section_headings = answer_sheet_has_section_headings(text)
    if has_section_headings:
        before, after = re.split(r"科目：\s*進出口外匯業務", text, maxsplit=1)
        remittance_section = re.split(r"科目：\s*國外匯兌業務", before, maxsplit=1)[-1]
        trade_section = after
        pattern = re.compile(r"(\d{1,2})\.\s*【([1-4*])】")
        remittance = {int(n): answer for n, answer in pattern.findall(remittance_section)}
        trade = {int(n): answer for n, answer in pattern.findall(trade_section)}
    else:
        remittance: dict[int, str] = {}
        trade: dict[int, str] = {}
        for line in text.splitlines():
            match = re.fullmatch(r"\s*(\d{1,2})\s+(.+?)\s*", line)
            if not match:
                continue
            number = int(match.group(1))
            tail = match.group(2).strip()
            if number <= 50:
                if tail.startswith("一律給分"):
                    remittance[number] = "*"
                    remaining = tail[len("一律給分") :].strip()
                    if remaining in ANSWER_KEYS or remaining in "1234":
                        trade[number] = remaining
                    continue
                parts = tail.split()
                if not parts:
                    continue
                remittance[number] = parts[0]
                if len(parts) >= 2:
                    trade[number] = parts[1]
            else:
                parts = tail.split()
                if parts:
                    trade[number] = parts[0]

    if len(remittance) != 50 or len(trade) != 80:
        raise ValueError(
            f"Session {session} answer sheet: expected 50/80, got {len(remittance)}/{len(trade)}"
        )
    return remittance, trade


def normalize_answer_token(
    token: str,
    session: int,
    subject_id: str,
    number: int,
) -> tuple[str, list[str], bool, bool, str | None]:
    exception = SCORING_EXCEPTIONS.get((session, subject_id, number))
    if exception:
        all_answered = bool(exception.get("all_answered"))
        automatic_credit = bool(exception.get("automatic"))
        accepted = list(
            exception.get(
                "accepted",
                list(ANSWER_KEYS) if all_answered or automatic_credit else [],
            )
        )
        if not accepted:
            accepted = list(ANSWER_KEYS)
        return accepted[0], accepted, all_answered, automatic_credit, str(exception["note"])

    if token not in {"1", "2", "3", "4"}:
        raise ValueError(f"Unexpected answer token {token!r}: {session}/{subject_id}/{number}")
    key = ANSWER_KEYS[int(token) - 1]
    return key, [key], False, False, None


def independent_texts(path: Path) -> tuple[str, str, str]:
    poppler = pdftotext_path(path)
    fitz_text = "\n".join(page.get_text("text") for page in fitz.open(path))
    reader = pypdf.PdfReader(str(path))
    pypdf_text = "\n".join(page.extract_text() or "" for page in reader.pages)
    return poppler, fitz_text, pypdf_text


def build_legacy_explanation(
    session: int,
    number: int,
    question: str,
    options: list[str],
    accepted_answers: list[str],
    all_answered_credit: bool,
    automatic_credit: bool,
    answer_note: str | None,
) -> str:
    if automatic_credit:
        return f"依第{session}屆官方答案表，本題{answer_note or '一律給分'}。"
    if all_answered_credit:
        return f"依第{session}屆官方答案表，本題{answer_note or '凡有作答均予計分'}。"
    if len(accepted_answers) > 1:
        labels = "、".join(f"（{ANSWER_KEYS.index(key) + 1}）" for key in accepted_answers)
        return f"依第{session}屆官方答案表，本題{labels}均予計分。"
    key = accepted_answers[0]
    index = ANSWER_KEYS.index(key) + 1
    correct_option = options[index - 1]
    negative = bool(re.search(r"(錯誤|不正確|不適當|不包括|不屬於|非屬|不得|何者非)", question))
    if negative:
        return f"題幹要求辨識不符合當屆規定的敘述；依官方答案，應選（{index}）「{correct_option}」。"
    return f"依第{session}屆官方答案，應選（{index}）「{correct_option}」。"


def question_spec_records(spec: QuestionPdf, answers: dict[int, str]) -> tuple[list[dict[str, Any]], int, dict[str, Any]]:
    path = source_path(spec.session, spec.filename)
    poppler_text, fitz_text, pypdf_text = independent_texts(path)
    normalized_engines = {
        "pdftotext": normalize_compare(poppler_text),
        "pymupdf": normalize_compare(fitz_text),
        "pypdf": normalize_compare(pypdf_text),
    }

    if (spec.session, spec.subject_id) == (36, "trade"):
        parsed = parse_session36_trade(path)
    else:
        parsed = [
            (number, page, *parse_question_block(block, number, spec.session, spec.subject_id))
            for number, page, block in split_question_blocks(poppler_text, spec.count)
        ]

    records: list[dict[str, Any]] = []
    verified_fields = 0
    for number, page, question, options, canonical_block in parsed:
        for field_name, field_value in [("question", question)] + [
            (f"option{index}", option) for index, option in enumerate(options, start=1)
        ]:
            normalized = normalize_compare(field_value)
            for engine_name, engine_text in normalized_engines.items():
                if normalized not in engine_text:
                    raise ValueError(
                        f"{engine_name} text mismatch: session {spec.session} {spec.subject_id} q{number} {field_name}: {field_value!r}"
                    )
            verified_fields += 1

        answer, accepted_answers, all_answered_credit, automatic_credit, answer_note = normalize_answer_token(
            answers[number], spec.session, spec.subject_id, number
        )
        explanation_key = (spec.session, spec.subject_id, number)
        if explanation_key in EXPLANATIONS:
            explanation = EXPLANATIONS[explanation_key].strip()
            explanation_kind = "project-authored-detailed"
        else:
            explanation = build_legacy_explanation(
                spec.session,
                number,
                question,
                options,
                accepted_answers,
                all_answered_credit,
                automatic_credit,
                answer_note,
            )
            explanation_kind = "official-answer-based"

        question_id = f"fx-{spec.session}-{spec.subject_id}-{number:03d}"
        relative_source = f"{spec.session}/{spec.filename}"
        records.append(
            {
                "id": question_id,
                "examId": EXAM_ID,
                "bankId": SUBJECT_BANK_IDS[spec.subject_id],
                "bankTitle": SUBJECT_TITLES[spec.subject_id],
                "chapter": f"第{spec.session}屆",
                "question": question,
                "options": dict(zip(ANSWER_KEYS, options, strict=True)),
                "answer": answer,
                "acceptedAnswers": accepted_answers,
                "allAnsweredCredit": all_answered_credit,
                "automaticCredit": automatic_credit,
                "answerNote": answer_note,
                "explanation": explanation,
                "explanationKind": explanation_kind,
                "sourceFile": spec.filename,
                "sourcePath": relative_source,
                "sourcePdfSha256": sha256_bytes(path.read_bytes()),
                "batchId": f"fx-archive-{spec.session}",
                "importedAt": IMPORTED_AT,
                "reviewStatus": "checked",
                "tags": [
                    "初階外匯",
                    f"第{spec.session}屆",
                    SUBJECT_TITLES[spec.subject_id],
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

    source_info = {
        "session": spec.session,
        "subjectId": spec.subject_id,
        "path": str(path.relative_to(PROJECT_ROOT)),
        "filename": spec.filename,
        "pages": len(pypdf.PdfReader(str(path)).pages),
        "sha256": sha256_bytes(path.read_bytes()),
        "kind": "questions",
        "extraction": "embedded Unicode text",
    }
    return records, verified_fields, source_info


def json_bytes(payload: object) -> bytes:
    return (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def write_if_changed(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json_bytes(payload)
    if not path.exists() or path.read_bytes() != data:
        path.write_bytes(data)


def build_all() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    answers_by_session: dict[int, tuple[dict[int, str], dict[int, str]]] = {}
    answer_checks: list[dict[str, Any]] = []
    source_files: list[dict[str, Any]] = []

    for session, files in sorted(SESSION_FILES.items()):
        path = source_path(session, files.answers)
        engine_results: dict[str, tuple[dict[int, str], dict[int, str]]] = {}
        engine_texts = {
            "pdftotext": pdftotext_path(path),
            "pymupdf": "\n".join(page.get_text("text") for page in fitz.open(path)),
            "pypdf": "\n".join(page.extract_text() or "" for page in pypdf.PdfReader(str(path)).pages),
        }
        canonical = parse_answer_text(engine_texts["pdftotext"], session)
        section_style = answer_sheet_has_section_headings(engine_texts["pdftotext"])
        for engine_name, text in engine_texts.items():
            verify_answer_text(
                text,
                canonical[0],
                canonical[1],
                section_style=section_style,
                engine_name=engine_name,
                session=session,
            )
        answers_by_session[session] = canonical
        answer_checks.append(
            {
                "session": session,
                "answerCount": 130,
                "pdftotext": "matched",
                "pymupdf": "matched",
                "pypdf": "matched",
            }
        )
        source_files.append(
            {
                "session": session,
                "path": str(path.relative_to(PROJECT_ROOT)),
                "filename": files.answers,
                "pages": len(pypdf.PdfReader(str(path)).pages),
                "sha256": sha256_bytes(path.read_bytes()),
                "kind": "answers",
            }
        )

    records: list[dict[str, Any]] = []
    verified_fields = 0
    for spec in sorted(QUESTION_PDFS, key=lambda item: (item.session, item.subject_id)):
        answer_map = answers_by_session[spec.session][0 if spec.subject_id == "remittance" else 1]
        shard_records, shard_verified, source_info = question_spec_records(spec, answer_map)
        records.extend(shard_records)
        verified_fields += shard_verified
        source_files.append(source_info)

    expected_count = len(SESSION_FILES) * 130
    if len(records) != expected_count:
        raise ValueError(f"Expected {expected_count} records, got {len(records)}")
    if len({record["id"] for record in records}) != expected_count:
        raise ValueError("Duplicate question IDs")

    qa = {
        "schemaVersion": 3,
        "examId": EXAM_ID,
        "sessionRange": [min(SESSION_FILES), max(SESSION_FILES)],
        "canonicalExtractor": "pdftotext -raw (PyMuPDF coordinate segmentation for session 36 trade)",
        "independentExtractors": ["PyMuPDF", "pypdf"],
        "ocrUsed": False,
        "aiUsedForQuestionOrAnswerText": False,
        "questionCount": len(records),
        "answerCount": len(records),
        "explanationCount": len(records),
        "verifiedTextFields": verified_fields,
        "expectedTextFields": len(records) * 5,
        "answerEngineChecks": answer_checks,
        "specialScoringQuestionCount": len(SCORING_EXCEPTIONS),
        "sourceFiles": source_files,
        "humanDoubleEntryProofreading": False,
        "verificationScope": (
            "Every stem and four options occur in all three embedded-text extraction paths after "
            "compatibility and whitespace normalization. Every answer sheet matched all three extractors."
        ),
    }
    return records, qa


def build_manifest(records: list[dict[str, Any]], qa: dict[str, Any]) -> dict[str, Any]:
    files: list[dict[str, Any]] = []
    sessions: list[dict[str, Any]] = []
    for session in sorted(SESSION_FILES, reverse=True):
        subjects: list[dict[str, Any]] = []
        for subject_id, count in (("remittance", 50), ("trade", 80)):
            filename = f"{session}-{subject_id}.json"
            shard = [
                record for record in records if record["session"] == session and record["subjectId"] == subject_id
            ]
            files.append(
                {
                    "session": session,
                    "subjectId": subject_id,
                    "path": f"api/_data/foreign-exchange/{filename}",
                    "questionCount": len(shard),
                    "sha256": sha256_bytes(json_bytes(shard)),
                }
            )
            subjects.append(
                {
                    "id": subject_id,
                    "title": SUBJECT_TITLES[subject_id],
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
            f"{record['id']}|{record['sourceTextSha256']}|{','.join(record['acceptedAnswers'])}|{record['allAnsweredCredit']}|{record['automaticCredit']}|{sha256_text(record['explanation'])}"
            for record in records
        )
    )
    return {
        "schemaVersion": 3,
        "examId": EXAM_ID,
        "title": "初階外匯",
        "questionCount": len(records),
        "contentSignature": content_signature,
        "sessionRange": [min(SESSION_FILES), max(SESSION_FILES)],
        "sessions": sessions,
        "files": files,
        "quality": {
            "ocrUsed": False,
            "questionAnswerTextSource": "embedded PDF text layer",
            "verifiedTextFields": qa["verifiedTextFields"],
            "answerCrossCheck": "three extraction paths matched",
            "specialScoringQuestionCount": len(SCORING_EXCEPTIONS),
        },
    }


def generate_index_ts() -> str:
    sessions = sorted(SESSION_FILES)
    imports: list[str] = []
    shard_names: list[str] = []
    for session in sessions:
        for subject_id in ("remittance", "trade"):
            name = f"{subject_id}{session}"
            imports.append(
                f'import {name} from "./{session}-{subject_id}.json" with {{ type: "json" }};'
            )
            shard_names.append(name)
    imports.append('import manifest from "./manifest.json" with { type: "json" };')
    session_union = " | ".join(str(session) for session in sessions)
    return (
        "\n".join(imports)
        + "\n\n"
        + 'export type ForeignExchangeAnswerKey = "A" | "B" | "C" | "D";\n'
        + 'export type ForeignExchangeSubjectId = "remittance" | "trade";\n'
        + f"export type ForeignExchangeSession = {session_union};\n\n"
        + "export type ForeignExchangeQuestionRecord = {\n"
        + '  id: string;\n  examId: "junior-foreign-exchange";\n  bankId: string;\n  bankTitle: string;\n'
        + "  chapter: string;\n  question: string;\n  options: Record<ForeignExchangeAnswerKey, string>;\n"
        + "  answer: ForeignExchangeAnswerKey;\n  acceptedAnswers: ForeignExchangeAnswerKey[];\n"
        + "  allAnsweredCredit: boolean;\n  automaticCredit: boolean;\n  answerNote: string | null;\n  explanation: string;\n"
        + "  explanationKind: string;\n  sourceFile: string;\n  sourcePath: string;\n  sourcePdfSha256: string;\n"
        + "  batchId: string;\n  importedAt: string;\n  reviewStatus: string;\n  tags: string[];\n"
        + "  session: ForeignExchangeSession;\n  subjectId: ForeignExchangeSubjectId;\n  questionNumber: number;\n"
        + '  standardVersion: "SWIFT MT" | "ISO 20022";\n  sourcePage: number;\n  sourceTextSha256: string;\n};\n\n'
        + "export type ForeignExchangeManifest = typeof manifest;\n\n"
        + "const shards = [\n  "
        + ",\n  ".join(shard_names)
        + "\n] as unknown as ForeignExchangeQuestionRecord[][];\n\n"
        + "export const foreignExchangeManifest = manifest;\n"
        + "export const foreignExchangeQuestions = shards.flat();\n"
    )


def write_qa_report(qa: dict[str, Any], manifest: dict[str, Any]) -> None:
    report = f"""# 初階外匯第23至47屆文字與答案驗證報告

- 題目總數：{qa['questionCount']:,}
- 屆次：第{qa['sessionRange'][0]}至{qa['sessionRange'][1]}屆
- 題幹與選項欄位：{qa['verifiedTextFields']:,} / {qa['expectedTextFields']:,}
- 官方答案：{qa['answerCount']:,}
- 特殊計分題：{qa['specialScoringQuestionCount']}
- 特殊計分分類：3題複數可計分答案、2題凡有作答給分、1題一律給分
- 題庫schema：v3（區分 `allAnsweredCredit` 與 `automaticCredit`）
- OCR：未使用
- 題目／答案文字：未使用AI生成
- 內容簽章：`{manifest['contentSignature']}`

題目與選項均取自來源PDF的內嵌文字層，並以 Poppler、PyMuPDF、pypdf 三條路徑交叉核對。第36屆進出口外匯PDF的選項編號字型缺少Unicode映射，因此使用PDF原生文字座標與印刷選項標記像素進行分段；題文仍為原生文字，未使用OCR。

第23至44屆PDF只提供試題與答案，解析採「依官方答案指出正確選項」的保守格式；第45至47屆沿用逐題詳細解析。

特殊計分依官方答案表分開建模：「凡有作答」必須至少選擇一個選項；「一律給分」即使留白，交卷後仍計入得分。模擬考交卷前不會提前顯示這項得分。
"""
    QA_REPORT.write_text(report, encoding="utf-8")


def write_outputs(records: list[dict[str, Any]], qa: dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for session in sorted(SESSION_FILES):
        for subject_id in ("remittance", "trade"):
            shard = [
                record for record in records if record["session"] == session and record["subjectId"] == subject_id
            ]
            write_if_changed(OUTPUT_DIR / f"{session}-{subject_id}.json", shard)

    manifest = build_manifest(records, qa)
    write_if_changed(OUTPUT_DIR / "manifest.json", manifest)
    (OUTPUT_DIR / "index.ts").write_text(generate_index_ts(), encoding="utf-8")

    audit_payload = {
        **qa,
        "contentSignature": manifest["contentSignature"],
        "questions": [
            {
                "id": record["id"],
                "sourcePath": record["sourcePath"],
                "sourcePage": record["sourcePage"],
                "sourceTextSha256": record["sourceTextSha256"],
                "sourcePdfSha256": record["sourcePdfSha256"],
                "answer": record["answer"],
                "acceptedAnswers": record["acceptedAnswers"],
                "allAnsweredCredit": record["allAnsweredCredit"],
                "automaticCredit": record["automaticCredit"],
                "explanationSha256": sha256_text(record["explanation"]),
            }
            for record in records
        ],
    }
    write_if_changed(AUDIT_DIR / "foreign-exchange-source-audit.json", audit_payload)
    write_qa_report(qa, manifest)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    records, qa = build_all()
    expected = {
        "manifest": json_bytes(build_manifest(records, qa)),
        "index": generate_index_ts().encode("utf-8"),
    }

    if args.check:
        for session in sorted(SESSION_FILES):
            for subject_id in ("remittance", "trade"):
                shard = [
                    record
                    for record in records
                    if record["session"] == session and record["subjectId"] == subject_id
                ]
                path = OUTPUT_DIR / f"{session}-{subject_id}.json"
                if not path.exists() or path.read_bytes() != json_bytes(shard):
                    raise SystemExit(f"Foreign-exchange shard is stale: {path}")
        if not (OUTPUT_DIR / "manifest.json").exists() or (OUTPUT_DIR / "manifest.json").read_bytes() != expected["manifest"]:
            raise SystemExit("Foreign-exchange manifest is stale")
        if not (OUTPUT_DIR / "index.ts").exists() or (OUTPUT_DIR / "index.ts").read_bytes() != expected["index"]:
            raise SystemExit("Foreign-exchange index is stale")
        print(f"Foreign-exchange source audit passed: {len(records):,} questions, {qa['verifiedTextFields']:,} verified fields.")
        return

    write_outputs(records, qa)
    print(f"Foreign-exchange archive generated: {len(records):,} questions across sessions {min(SESSION_FILES)}-{max(SESSION_FILES)}.")


if __name__ == "__main__":
    main()
