#!/usr/bin/env python3
"""Create review-only mobile crop candidates; OCR text is never persisted.

Default scope is the 10-question trial and default mode is dry-run. Use --all
for a review report of the complete bank. Persisting fields requires both
--apply and --approve-reviewed after a human has compared the generated preview
with its source crop; all-bank approval is intentionally forbidden. A failed
source segment makes the entire optional field fall back to its existing crop.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass
from datetime import datetime
from functools import lru_cache
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/data/pdf-image-quiz.json"
TRIAL = ROOT / "public/data/pdf-image-quiz-trial.json"
CACHE = ROOT / "tmp/mobile-segment-ocr/v2"
REPORT = ROOT / "tmp/mobile-segment-candidates.json"
PREVIEWS = ROOT / "tmp/mobile-segment-previews"
EVIDENCE_ROOT = ROOT / "docs/review-evidence/mobile-segments"
FIELDS = (
    ("question", "questionSegments", "mobileQuestionSegments", "mobileQuestionSegmentsVerification"),
    ("explanation", "explanationSegments", "mobileExplanationSegments", "mobileExplanationSegmentsVerification"),
)
VERIFICATION_PREFIX = "pixel-and-visual-reviewed:v2"
RUNTIME_CROP_MAX_HEIGHT = 44
SEGMENT_KEYS = ("page", "src", "x", "y", "width", "height", "pageWidth", "pageHeight")

try:
    OCR_ENGINE_VERSION = version("rapidocr-onnxruntime")
except PackageNotFoundError:
    OCR_ENGINE_VERSION = "unknown"


def package_version(name: str) -> str:
    try:
        return version(name)
    except PackageNotFoundError:
        return "unknown"


def generator_fingerprint() -> dict[str, Any]:
    return {
        "scriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "python": sys.version.split()[0],
        "packages": {
            "numpy": package_version("numpy"),
            "onnxruntime": package_version("onnxruntime"),
            "Pillow": package_version("Pillow"),
            "rapidocr-onnxruntime": OCR_ENGINE_VERSION,
        },
    }


@dataclass(frozen=True)
class Segment:
    page: int
    src: str
    x: int
    y: int
    width: int
    height: int
    pageWidth: int
    pageHeight: int

    @property
    def right(self) -> int:
        return self.x + self.width

    @property
    def bottom(self) -> int:
        return self.y + self.height


@dataclass(frozen=True)
class Box:
    x1: int
    y1: int
    x2: int
    y2: int
    score: float


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument("--all", action="store_true")
    scope.add_argument("--question-id", action="append", default=[])
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--approve-reviewed", type=Path)
    parser.add_argument("--approval-output", type=Path)
    parser.add_argument("--reviewed-by")
    parser.add_argument("--reviewed-at")
    parser.add_argument("--reject-field", action="append", default=[])
    parser.add_argument("--replace-existing", action="store_true")
    parser.add_argument("--previews", action="store_true")
    parser.add_argument("--output", type=Path, default=REPORT)
    parser.add_argument("--target-css-width", type=int, default=352)
    parser.add_argument("--min-text-px", type=float, default=18)
    parser.add_argument("--min-coverage", type=float, default=0.965)
    parser.add_argument("--max-segments", type=int, default=64)
    return parser.parse_args()


def questions(data: dict[str, Any]) -> list[dict[str, Any]]:
    return [q for b in data["banks"] for c in b["chapters"] for q in c["questions"]]


def parse_segment(raw: dict[str, Any]) -> Segment:
    return Segment(**{key: raw[key] for key in Segment.__dataclass_fields__})


def canonical_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def normalized_segments(raw_segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{key: raw[key] for key in SEGMENT_KEYS} for raw in raw_segments]


@lru_cache(maxsize=None)
def source_image_hash(src: str) -> str:
    return hashlib.sha256((ROOT / "public" / src).read_bytes()).hexdigest()


def source_signature(raw_segments: list[dict[str, Any]]) -> str:
    segments = normalized_segments(raw_segments)
    images = [
        {"src": src, "sha256": source_image_hash(src)}
        for src in sorted({segment["src"] for segment in segments})
    ]
    return canonical_hash({"segments": segments, "images": images})


def segments_signature(raw_segments: list[dict[str, Any]]) -> str:
    return canonical_hash(normalized_segments(raw_segments))


def verification_value(result: dict[str, Any], review_evidence_hash: str) -> str:
    coverage_units = round(float(result["coverage"]) * 100_000)
    return ":".join((
        VERIFICATION_PREFIX,
        result["sourceSignature"],
        result["segmentsSignature"],
        str(coverage_units),
        review_evidence_hash,
    ))


@lru_cache(maxsize=None)
def ocr_cache_path(src: str) -> Path:
    source_path = ROOT / "public" / src
    relative = Path(src)
    digest = hashlib.sha256(source_path.read_bytes()).hexdigest()[:20]
    return (
        CACHE
        / OCR_ENGINE_VERSION
        / relative.parent
        / f"{relative.stem}-{digest}.json"
    )


class Locator:
    def __init__(self) -> None:
        self.engine: Any | None = None

    def boxes(self, src: str) -> list[Box]:
        cache_path = ocr_cache_path(src)
        if cache_path.exists():
            return [Box(**row) for row in json.loads(cache_path.read_text("utf-8"))]
        if self.engine is None:
            from rapidocr_onnxruntime import RapidOCR

            self.engine = RapidOCR()
        result, _ = self.engine(str(ROOT / "public" / src))
        rows: list[Box] = []
        for polygon, _text, score in result or []:
            xs = [point[0] for point in polygon]
            ys = [point[1] for point in polygon]
            rows.append(Box(round(min(xs)), round(min(ys)), round(max(xs)), round(max(ys)), round(float(score), 6)))
        rows.sort(key=lambda row: (row.y1, row.x1))
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps([asdict(row) for row in rows], indent=2) + "\n", "utf-8")
        return rows


@lru_cache(maxsize=8)
def page_image(src: str) -> Image.Image:
    with Image.open(ROOT / "public" / src) as image:
        return image.convert("L").copy()


def table_like(gray: np.ndarray) -> bool:
    ink = gray < 155
    return bool(np.any(ink.mean(axis=1) >= 0.62) or (gray.shape[0] >= 100 and np.any(ink.mean(axis=0) >= 0.58)))


def intersect(box: Box, crop: Segment) -> bool:
    width = max(0, min(box.x2, crop.right) - max(box.x1, crop.x))
    height = max(0, min(box.y2, crop.bottom) - max(box.y1, crop.y))
    return width * height / max(1, (box.x2 - box.x1) * (box.y2 - box.y1)) >= 0.28


def merge_rows(boxes: list[Box], crop: Segment) -> list[list[int]]:
    rows: list[list[int]] = []
    for box in boxes:
        if not intersect(box, crop):
            continue
        current = [max(crop.x, box.x1), max(crop.y, box.y1), min(crop.right, box.x2), min(crop.bottom, box.y2), max(1, box.y2 - box.y1)]
        if current[2] - current[0] < 8 or current[3] - current[1] < 6:
            continue
        match = None
        for row in rows[-3:]:
            overlap = max(0, min(row[3], current[3]) - max(row[1], current[1]))
            height = max(1, min(row[3] - row[1], current[3] - current[1]))
            center_delta = abs((row[1] + row[3]) - (current[1] + current[3])) / 2
            if overlap / height >= 0.42 or center_delta <= max(row[4], current[4]) * 0.42:
                match = row
                break
        if match is None:
            rows.append(current)
        else:
            match[0], match[1] = min(match[0], current[0]), min(match[1], current[1])
            match[2], match[3] = max(match[2], current[2]), max(match[3], current[3])
            match[4] = max(match[4], current[4])
    for row in rows:
        row[0], row[2] = max(crop.x, row[0] - 8), min(crop.right, row[2] + 8)
        row[1], row[3] = max(crop.y, row[1] - 7), min(crop.bottom, row[3] + 7)
    return sorted(rows, key=lambda row: (row[1], row[0]))


def whitespace_cut(values: np.ndarray, desired: int, low: int, high: int) -> int | None:
    runs: list[tuple[float, int]] = []
    start: int | None = None
    for index in range(low, high):
        if values[index] == 0 and start is None:
            start = index
        if values[index] != 0 and start is not None:
            width = index - start
            if width >= 3:
                center = (start + index) // 2
                # Prefer a real word/option gap over a tiny glyph-internal gap,
                # even when the wider gap is a little farther from the ideal cut.
                runs.append((abs(center - desired) - min(24, width) * 5, center))
            start = None
    if start is not None and high - start >= 3:
        center = (start + high) // 2
        runs.append((abs(center - desired) - min(24, high - start) * 5, center))
    return min(runs, default=(0, None))[1]


def split_row(image: Image.Image, crop: Segment, row: list[int], args: argparse.Namespace) -> list[Segment] | None:
    x1, y1, x2, y2, text_height = row
    gray = np.asarray(image.crop((x1, y1, x2, y2)))
    columns = (gray < 170).sum(axis=0)
    content = np.flatnonzero(columns)
    if not content.size:
        return None
    left, right = x1 + int(content[0]), x1 + int(content[-1]) + 1
    max_width = max(420, min(760, round(text_height * args.target_css_width / args.min_text_px)))
    count = max(1, math.ceil((right - left) / max_width))
    minimum = min(240, max(120, round(text_height * 4)))
    local_left, local_right, previous = left - x1, right - x1, left - x1
    cuts: list[int] = []
    for index in range(1, count):
        desired = round(local_left + (local_right - local_left) * index / count)
        remaining = count - index
        low = max(previous + minimum, desired - 130)
        high = min(local_right - remaining * minimum + 1, desired + 131)
        cut = whitespace_cut(columns, desired, low, high) if high > low else None
        if cut is None:
            return None
        cuts.append(x1 + cut)
        previous = cut
    edges = [left, *cuts, right]
    return [
        Segment(crop.page, crop.src, max(crop.x, start - (8 if i == 0 else 0)), y1,
                min(crop.right, end + (8 if i == len(edges) - 2 else 0)) - max(crop.x, start - (8 if i == 0 else 0)),
                y2 - y1, crop.pageWidth, crop.pageHeight)
        for i, (start, end) in enumerate(zip(edges, edges[1:]))
    ]


def coverage(gray: np.ndarray, crop: Segment, segments: list[Segment]) -> float:
    ink = gray < 170
    total = int(ink.sum())
    covered = np.zeros_like(ink, dtype=bool)
    for segment in segments:
        covered[segment.y - crop.y:segment.bottom - crop.y, segment.x - crop.x:segment.right - crop.x] = True
    return float((ink & covered).sum() / total) if total else 0


def candidate(source: list[dict[str, Any]], locator: Locator, args: argparse.Namespace) -> dict[str, Any]:
    output: list[Segment] = []
    scores: list[float] = []
    for raw in source:
        crop = parse_segment(raw)
        image = page_image(crop.src)
        gray = np.asarray(image.crop((crop.x, crop.y, crop.right, crop.bottom)))
        if table_like(gray):
            return {"status": "fallback", "reason": "table-or-grid-detected", "coverage": 0, "segments": []}
        rows = merge_rows(locator.boxes(crop.src), crop)
        if not rows:
            return {"status": "fallback", "reason": "no-ocr-row", "coverage": 0, "segments": []}
        emitted: list[Segment] = []
        for row in rows:
            if (
                row[1] >= round(crop.pageHeight * 0.94)
                and row[2] - row[0] <= 180
                and row[3] - row[1] <= 48
            ):
                return {"status": "fallback", "reason": "footer-like-ink", "coverage": 0, "segments": []}
            pieces = split_row(image, crop, row, args)
            if not pieces:
                return {"status": "fallback", "reason": "no-safe-whitespace-cut", "coverage": 0, "segments": []}
            emitted.extend(pieces)
        score = coverage(gray, crop, emitted)
        if score < args.min_coverage:
            return {"status": "fallback", "reason": "insufficient-ink-coverage", "coverage": round(score, 5), "segments": []}
        output.extend(emitted)
        scores.append(score)
    if not output or len(output) > args.max_segments:
        return {"status": "fallback", "reason": "segment-limit", "coverage": 0, "segments": []}
    return {"status": "candidate", "reason": "passed", "coverage": round(min(scores), 5), "segments": [asdict(row) for row in output]}


def preview(path: Path, raw_source: list[dict[str, Any]], raw_segments: list[dict[str, Any]], width: int) -> str:
    source, segments = [parse_segment(raw) for raw in raw_source], [parse_segment(raw) for raw in raw_segments]
    output_width, gap, header = width * 2, 12, 30

    def render(items: list[Segment], runtime: bool) -> list[Image.Image]:
        images: list[Image.Image] = []
        for segment in items:
            target_width = output_width
            if runtime:
                target_width = min(
                    output_width,
                    round(segment.width / segment.height * RUNTIME_CROP_MAX_HEIGHT * 2),
                )
            image = page_image(segment.src).crop((segment.x, segment.y, segment.right, segment.bottom)).convert("RGB")
            images.append(image.resize((target_width, max(1, round(target_width * segment.height / segment.width))), Image.Resampling.LANCZOS))
        return images

    source_images, mobile_images = render(source, False), render(segments, True)
    height = (
        header * 2
        + sum(image.height for image in source_images)
        + sum(image.height for image in mobile_images)
        + gap * max(0, len(source_images) - 1)
        + gap * max(0, len(mobile_images) - 1)
    )
    canvas = Image.new("RGB", (output_width, height), "white")
    draw = ImageDraw.Draw(canvas)
    draw.text((8, 8), "ORIGINAL CROP", fill=(60, 70, 80))
    y = header
    for image in source_images:
        canvas.paste(image, (0, y)); y += image.height + gap
    y -= gap if source_images else 0
    draw.rectangle((0, y, output_width, y + header), fill=(238, 242, 244))
    draw.text((8, y + 8), "MOBILE RUNTIME SCALE", fill=(60, 70, 80))
    y += header
    for image in mobile_images:
        canvas.paste(image, (0, y)); y += image.height + gap
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path, optimize=True)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_data(path: Path, value: dict[str, Any]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", "utf-8")
    os.replace(temporary, path)


def rooted_path(value: Path) -> Path:
    return value.resolve() if value.is_absolute() else (ROOT / value).resolve()


def require_evidence_path(path: Path, label: str) -> None:
    evidence_root = EVIDENCE_ROOT.resolve()
    if path != evidence_root and evidence_root not in path.parents:
        raise SystemExit(f"{label} must be stored under {EVIDENCE_ROOT.relative_to(ROOT)}")


def regenerate() -> None:
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if not npm:
        raise RuntimeError("npm is required after --apply")
    for script in ("validate:image-data", "generate:shards", "generate:plan-index"):
        subprocess.run([npm, "run", script], cwd=ROOT, check=True, shell=os.name == "nt")


def main() -> None:
    args = arguments()
    output = rooted_path(args.output)
    if args.apply != bool(args.approve_reviewed):
        raise SystemExit("Persisting candidates requires both --apply and --approve-reviewed")
    if args.apply and args.all:
        raise SystemExit("All-bank approval is forbidden; approve only explicitly reviewed trial or question IDs")
    if args.apply and not args.replace_existing:
        raise SystemExit("Approved apply must use --replace-existing so every persisted field is compared with the reviewed report")
    approval_args = (args.approval_output, args.reviewed_by, args.reviewed_at)
    if args.apply and not all(approval_args):
        raise SystemExit("Approved apply requires --approval-output, --reviewed-by and timezone-aware --reviewed-at")
    if not args.apply and any(approval_args):
        raise SystemExit("Approval metadata is valid only with --apply")
    if not args.apply and args.reject_field:
        raise SystemExit("--reject-field is valid only with an approved apply")
    reviewed_report: dict[str, Any] | None = None
    reviewed_report_hash = ""
    review_evidence_hash = ""
    if args.approve_reviewed:
        reviewed_path = rooted_path(args.approve_reviewed)
        approval_path = rooted_path(args.approval_output)
        require_evidence_path(reviewed_path, "Reviewed report")
        require_evidence_path(approval_path, "Approval evidence")
        if output == reviewed_path or output == approval_path or reviewed_path == approval_path:
            raise SystemExit("Reviewed report, approval evidence and apply output must use different paths")
        reviewed_bytes = reviewed_path.read_bytes()
        reviewed_report = json.loads(reviewed_bytes)
        if reviewed_report.get("mode") != "dry-run" or reviewed_report.get("reviewStatus") != "needs-review":
            raise SystemExit("--approve-reviewed must point to an unmodified dry-run review report")
        if reviewed_report.get("previewPolicy") != "candidate-contact-sheet-sha256":
            raise SystemExit("Reviewed report must be generated with --previews")
        if reviewed_report.get("generator") != generator_fingerprint():
            raise SystemExit("Generator or OCR dependency fingerprint changed; generate and review a fresh report")
        reviewed_report_hash = hashlib.sha256(reviewed_bytes).hexdigest()
        reviewed_by = str(args.reviewed_by).strip()
        if not reviewed_by or len(reviewed_by) > 120:
            raise SystemExit("--reviewed-by must contain 1-120 characters")
        try:
            reviewed_at = datetime.fromisoformat(str(args.reviewed_at).replace("Z", "+00:00"))
        except ValueError as error:
            raise SystemExit("--reviewed-at must be an ISO-8601 timestamp") from error
        if reviewed_at.tzinfo is None:
            raise SystemExit("--reviewed-at must include a timezone")
        rejected_fields: list[dict[str, str]] = []
        rejected_keys: set[str] = set()
        for raw_rejection in args.reject_field:
            parts = str(raw_rejection).split(":", 2)
            if len(parts) != 3 or parts[1] not in {"question", "explanation"} or not parts[2].strip():
                raise SystemExit("--reject-field must use questionId:question|explanation:reason")
            question_id, field, reason = parts[0], parts[1], parts[2].strip()
            key = f"{question_id}:{field}"
            if key in rejected_keys:
                raise SystemExit(f"Duplicate rejected field: {key}")
            rejected_keys.add(key)
            rejected_fields.append({"questionId": question_id, "field": field, "reason": reason})
        reviewed_candidates = {
            f"{item.get('questionId')}:{label}"
            for item in reviewed_report.get("questions", [])
            for label, *_rest in FIELDS
            if item.get(label, {}).get("status") == "candidate"
        }
        unknown_rejections = rejected_keys - reviewed_candidates
        if unknown_rejections:
            raise SystemExit(f"Rejected field is not a candidate in the reviewed report: {', '.join(sorted(unknown_rejections))}")
        approved_fields = [
            {
                "questionId": item.get("questionId"),
                "field": label,
                "previewSha256": item.get(label, {}).get("previewSha256"),
            }
            for item in reviewed_report.get("questions", [])
            for label, *_rest in FIELDS
            if item.get(label, {}).get("status") == "candidate"
            and f"{item.get('questionId')}:{label}" not in rejected_keys
        ]
        if not approved_fields or any(
            not isinstance(item["questionId"], str) or
            not isinstance(item["previewSha256"], str) or
            len(item["previewSha256"]) != 64
            for item in approved_fields
        ):
            raise SystemExit("Reviewed report is missing candidate preview hashes")
        approval_record = {
            "schemaVersion": 1,
            "kind": "mobile-segment-review-approval",
            "candidateReportSha256": reviewed_report_hash,
            "reviewedBy": reviewed_by,
            "reviewedAt": str(args.reviewed_at),
            "approvedFields": approved_fields,
            "rejectedFields": rejected_fields,
        }
        approval_bytes = (json.dumps(approval_record, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
        if approval_path.exists() and approval_path.read_bytes() != approval_bytes:
            raise SystemExit("Approval evidence is immutable; choose a new --approval-output path")
        approval_path.parent.mkdir(parents=True, exist_ok=True)
        approval_path.write_bytes(approval_bytes)
        review_evidence_hash = hashlib.sha256(approval_bytes).hexdigest()
    source_data, trial_data = json.loads(SOURCE.read_text("utf-8")), json.loads(TRIAL.read_text("utf-8"))
    all_questions, trial_questions = questions(source_data), questions(trial_data)
    by_id = {question["id"]: question for question in all_questions}
    if args.question_id:
        missing = [value for value in args.question_id if value not in by_id]
        if missing: raise SystemExit(f"Unknown question id(s): {', '.join(missing)}")
        selected, scope = [by_id[value] for value in dict.fromkeys(args.question_id)], "selected"
    elif args.all:
        selected, scope = all_questions, "all"
    else:
        selected, scope = [by_id[q["id"]] for q in trial_questions if q["id"] in by_id], "trial"
    if args.start < 0:
        raise SystemExit("--start must be zero or greater")
    selected = selected[args.start:]
    if args.limit > 0: selected = selected[:args.limit]
    reviewed_by_id = {
        item["questionId"]: item
        for item in (reviewed_report or {}).get("questions", [])
    }
    if reviewed_report is not None and set(reviewed_by_id) != {question["id"] for question in selected}:
        raise SystemExit("Reviewed report question IDs do not exactly match the apply scope")
    locator, results, apply_fields = Locator(), [], {}
    summary = {"questions": len(selected), "candidateFields": 0, "fallbackFields": 0, "existingFieldsPreserved": 0, "appliedFields": 0}
    for index, question in enumerate(selected, 1):
        print(f"[{index}/{len(selected)}] {question['id']}", flush=True)
        item = {"questionId": question["id"], "number": question["number"]}; fields = {}
        for label, source_field, mobile_field, verification_field in FIELDS:
            preview_path = PREVIEWS / f"{question['id']}-{label}.png"
            if args.previews:
                preview_path.unlink(missing_ok=True)
            verification = question.get(verification_field)
            if (
                question.get(mobile_field)
                and isinstance(verification, str)
                and verification.startswith(f"{VERIFICATION_PREFIX}:")
                and not args.replace_existing
            ):
                result = {"status": "existing", "reason": "preserved"}; summary["existingFieldsPreserved"] += 1
            else:
                result = candidate(question[source_field], locator, args)
                result["sourceSignature"] = source_signature(question[source_field])
                if result["status"] == "candidate":
                    result["segmentsSignature"] = segments_signature(result["segments"])
                    if args.previews or reviewed_report is not None:
                        result["previewSha256"] = preview(
                            preview_path,
                            question[source_field],
                            result["segments"],
                            args.target_css_width,
                        )
                if reviewed_report is not None:
                    expected = reviewed_by_id[question["id"]].get(label)
                    comparison_keys = ("status", "reason", "coverage", "segments", "sourceSignature", "segmentsSignature", "previewSha256")
                    if not isinstance(expected, dict) or any(expected.get(key) != result.get(key) for key in comparison_keys):
                        raise SystemExit(f"{question['id']} {label} no longer matches the reviewed report; run dry-run and review again")
                summary["candidateFields" if result["status"] == "candidate" else "fallbackFields"] += 1
                is_rejected = reviewed_report is not None and f"{question['id']}:{label}" in rejected_keys
                if result["status"] == "candidate" and not is_rejected:
                    fields[mobile_field] = result["segments"]
                    if args.apply:
                        fields[verification_field] = verification_value(result, review_evidence_hash)
                elif args.replace_existing or mobile_field in question or verification_field in question:
                    fields[mobile_field] = None
                    fields[verification_field] = None
            item[label] = result
        if fields: apply_fields[question["id"]] = fields
        results.append(item)
    if args.apply and apply_fields:
        source_before, trial_before = SOURCE.read_bytes(), TRIAL.read_bytes()
        try:
            for question in all_questions:
                if question["id"] in apply_fields:
                    for key, value in apply_fields[question["id"]].items():
                        if value is None: question.pop(key, None)
                        else: question[key] = value
                    summary["appliedFields"] += sum(
                        key in {field[2] for field in FIELDS} and value is not None
                        for key, value in apply_fields[question["id"]].items()
                    )
            for question in trial_questions:
                if question["id"] in apply_fields:
                    for key, value in apply_fields[question["id"]].items():
                        if value is None: question.pop(key, None)
                        else: question[key] = value
            write_data(SOURCE, source_data); write_data(TRIAL, trial_data); regenerate()
        except Exception:
            SOURCE.write_bytes(source_before); TRIAL.write_bytes(trial_before); regenerate(); raise
    report = {"schemaVersion": 4, "mode": "apply" if args.apply else "dry-run", "scope": scope,
              "reviewStatus": "pixel-and-visual-reviewed" if args.apply else "needs-review", "ocrUsage": "layout-location-only; recognized text is not stored",
              "reviewedReportHash": reviewed_report_hash or None,
              "reviewEvidenceHash": review_evidence_hash or None,
              "previewPolicy": "candidate-contact-sheet-sha256" if args.previews or args.apply else "none",
              "generator": generator_fingerprint(),
              "settings": {"targetCssWidth": args.target_css_width, "minTextPx": args.min_text_px, "minCoverage": args.min_coverage, "maxSegments": args.max_segments},
              "summary": summary, "questions": results}
    output.parent.mkdir(parents=True, exist_ok=True); output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(json.dumps(summary, ensure_ascii=False)); print(f"Review report: {output}")


if __name__ == "__main__":
    main()
