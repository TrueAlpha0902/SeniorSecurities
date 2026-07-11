"""Crop and downsample the generated Frieren story poses for web delivery."""

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

# Roughly 2x the largest CSS-rendered size, which keeps the art crisp on
# high-density displays without decoding the much larger generation canvases.
TARGET_SIZES = {
    "study.webp": (780, 832),
    "study-page.webp": (780, 832),
    "glasses-mid.webp": (780, 832),
    "tired.webp": (780, 832),
    "walk.webp": (470, 734),
    "walk-2.webp": (470, 734),
    "walk-3.webp": (470, 734),
    "walk-4.webp": (470, 734),
    "sleep.webp": (950, 675),
}


def main() -> None:
    for name, crop in CROPS.items():
        source = ASSET_DIR / name
        temporary = source.with_suffix(".optimized.webp")
        with Image.open(source) as image:
            rgba = image.convert("RGBA")
            # Generated source canvases still contain the original crop box.
            # Already-optimized assets do not, making this script idempotent.
            if rgba.width >= crop[2] and rgba.height >= crop[3]:
                optimized = rgba.crop(crop)
            else:
                optimized = rgba.copy()
            optimized.thumbnail(TARGET_SIZES[name], Image.Resampling.LANCZOS)
            optimized.save(
                temporary,
                "WEBP",
                quality=90,
                method=6,
                exact=True,
            )
        temporary.replace(source)
        print(f"{name}: {optimized.size[0]}x{optimized.size[1]} ({source.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
