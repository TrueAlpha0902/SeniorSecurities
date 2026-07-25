from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "public" / "data" / "pdf-image-quiz.json"
OUTPUT_FILE = ROOT / "public" / "data" / "similar-question-groups.json"

HASH_WIDTH = 72
HASH_HEIGHT = 36
MAX_GROUPS_PER_CHAPTER = 8
MAX_GROUPS_TOTAL = 180
MAX_DISTANCE = 0.265


@dataclass(frozen=True)
class QuestionFeature:
    question_id: str
    bank_id: str
    bank_title: str
    chapter_id: str
    chapter_title: str
    number: int
    answer: str
    bit_hash: int
    aspect: float
    segment_count: int


def main() -> None:
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    groups: list[dict[str, Any]] = []

    for bank in data["banks"]:
        for chapter in bank["chapters"]:
            features = [
                feature
                for question in chapter["questions"]
                if (feature := build_feature(bank, chapter, question)) is not None
            ]
            groups.extend(build_chapter_groups(features))

    groups.sort(key=lambda item: (item["score"], -len(item["questionIds"])))
    OUTPUT_FILE.write_text(
        json.dumps({"groups": groups[:MAX_GROUPS_TOTAL]}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {min(len(groups), MAX_GROUPS_TOTAL)} groups to {OUTPUT_FILE}")


def build_feature(bank: dict[str, Any], chapter: dict[str, Any], question: dict[str, Any]) -> QuestionFeature | None:
    image = render_question_image(question)
    if image is None:
        return None

    thumb = image.resize((HASH_WIDTH, HASH_HEIGHT), Image.Resampling.LANCZOS).convert("L")
    thumb = ImageOps.autocontrast(thumb)
    pixels = list(thumb.getdata())
    threshold = sum(pixels) / len(pixels)
    bit_hash = 0
    for pixel in pixels:
        bit_hash = (bit_hash << 1) | (1 if pixel < threshold else 0)

    return QuestionFeature(
        question_id=question["id"],
        bank_id=bank["bankId"],
        bank_title=bank["bankTitle"],
        chapter_id=chapter["chapterId"],
        chapter_title=chapter["chapterTitle"],
        number=int(question["number"]),
        answer=question["answer"],
        bit_hash=bit_hash,
        aspect=image.width / max(1, image.height),
        segment_count=len(question["questionSegments"]),
    )


def render_question_image(question: dict[str, Any]) -> Image.Image | None:
    crops: list[Image.Image] = []
    for segment in question["questionSegments"]:
        source = ROOT / "public" / segment["src"]
        if not source.exists():
            continue
        with Image.open(source) as page:
            crop = page.convert("L").crop(
                (
                    int(segment["x"]),
                    int(segment["y"]),
                    int(segment["x"] + segment["width"]),
                    int(segment["y"] + segment["height"]),
                )
            )
        crops.append(trim_whitespace(crop))

    if not crops:
        return None

    normalized: list[Image.Image] = []
    target_width = 520
    for crop in crops:
        ratio = target_width / max(1, crop.width)
        normalized.append(crop.resize((target_width, max(1, round(crop.height * ratio))), Image.Resampling.LANCZOS))

    height = sum(crop.height for crop in normalized) + 8 * (len(normalized) - 1)
    canvas = Image.new("L", (target_width, height), 255)
    y = 0
    for crop in normalized:
        canvas.paste(crop, (0, y))
        y += crop.height + 8
    return canvas


def trim_whitespace(image: Image.Image) -> Image.Image:
    mask = image.point(lambda pixel: 255 if pixel < 244 else 0)
    bbox = mask.getbbox()
    if bbox is None:
        return image
    left, top, right, bottom = bbox
    pad = 6
    return image.crop(
        (
            max(0, left - pad),
            max(0, top - pad),
            min(image.width, right + pad),
            min(image.height, bottom + pad),
        )
    )


def build_chapter_groups(features: list[QuestionFeature]) -> list[dict[str, Any]]:
    candidates: list[tuple[float, QuestionFeature, QuestionFeature]] = []
    for index, left in enumerate(features):
        for right in features[index + 1 :]:
            if abs(left.aspect - right.aspect) > 1.35:
                continue
            if abs(left.number - right.number) > 80 and left.segment_count == right.segment_count == 1:
                continue
            distance = normalized_distance(left.bit_hash, right.bit_hash)
            if distance <= MAX_DISTANCE:
                candidates.append((distance, left, right))

    candidates.sort(key=lambda item: item[0])
    used_pairs: set[tuple[str, str]] = set()
    groups: list[dict[str, Any]] = []

    for distance, left, right in candidates:
        pair_key = tuple(sorted((left.question_id, right.question_id)))
        if pair_key in used_pairs:
            continue

        members = [left, right]
        for other_distance, first, second in candidates:
            if other_distance > distance + 0.035:
                break
            for candidate in (first, second):
                if candidate.question_id in {member.question_id for member in members}:
                    continue
                if all(normalized_distance(candidate.bit_hash, member.bit_hash) <= MAX_DISTANCE + 0.025 for member in members):
                    members.append(candidate)
            if len(members) >= 4:
                break

        members.sort(key=lambda item: item.number)
        for index, first in enumerate(members):
            for second in members[index + 1 :]:
                used_pairs.add(tuple(sorted((first.question_id, second.question_id))))

        first_member = members[0]
        groups.append(
            {
                "id": f"{first_member.bank_id}-{first_member.chapter_id}-similar-{len(groups) + 1:03d}",
                "bankId": first_member.bank_id,
                "bankTitle": first_member.bank_title,
                "chapterId": first_member.chapter_id,
                "chapterTitle": first_member.chapter_title,
                "score": round(distance, 4),
                "questionIds": [member.question_id for member in members],
            }
        )

        if len(groups) >= MAX_GROUPS_PER_CHAPTER:
            break

    return groups


def normalized_distance(left_hash: int, right_hash: int) -> float:
    return (left_hash ^ right_hash).bit_count() / (HASH_WIDTH * HASH_HEIGHT)


if __name__ == "__main__":
    main()
