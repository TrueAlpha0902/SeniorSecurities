"""Crop transparent padding from the generated Frieren story poses."""

from pathlib import Path

from PIL import Image


ASSET_DIR = Path(__file__).resolve().parents[1] / "public" / "animation" / "frieren-story"

CROPS = {
    "study.webp": (210, 55, 1180, 1090),
    "study-page.webp": (210, 55, 1180, 1090),
    "glasses-mid.webp": (210, 55, 1180, 1090),
    "tired.webp": (210, 55, 1180, 1090),
    "walk.webp": (300, 30, 960, 1060),
    "walk-2.webp": (300, 30, 960, 1060),
    "walk-3.webp": (300, 30, 960, 1060),
    "walk-4.webp": (300, 30, 960, 1060),
    "sleep.webp": (95, 140, 1305, 1000),
}


def main() -> None:
    for name, crop in CROPS.items():
        source = ASSET_DIR / name
        temporary = source.with_suffix(".optimized.webp")
        with Image.open(source) as image:
            optimized = image.convert("RGBA").crop(crop)
            optimized.save(
                temporary,
                "WEBP",
                quality=92,
                method=6,
                exact=True,
            )
        temporary.replace(source)
        print(f"{name}: {optimized.size[0]}x{optimized.size[1]} ({source.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
