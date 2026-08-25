"""Generate a rights-safe compound-defining-accessory fixture at two scales."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent
SOURCE_DIR = ROOT / "sources"


def _scaled_points(points: list[tuple[int, int]], scale: int) -> list[tuple[int, int]]:
    return [(x * scale, y * scale) for x, y in points]


def build_fixture(scale: int) -> Image.Image:
    width, height = 400 * scale, 500 * scale
    image = Image.new("RGB", (width, height), (24, 26, 30))
    draw = ImageDraw.Draw(image)
    light = (232, 228, 212)
    dark = (18, 20, 24)
    edge = (128, 132, 138)

    # One clear subject with a single physical silhouette.
    draw.ellipse((150 * scale, 55 * scale, 300 * scale, 210 * scale), fill=light)
    draw.rounded_rectangle((105 * scale, 170 * scale, 330 * scale, 430 * scale), radius=48 * scale, fill=light)
    draw.rounded_rectangle((125 * scale, 390 * scale, 185 * scale, 475 * scale), radius=20 * scale, fill=light)
    draw.rounded_rectangle((250 * scale, 390 * scale, 310 * scale, 475 * scale), radius=20 * scale, fill=light)
    draw.ellipse((85 * scale, 450 * scale, 205 * scale, 485 * scale), fill=light)
    draw.ellipse((230 * scale, 450 * scale, 350 * scale, 485 * scale), fill=light)

    # An elongated accessory: larger body, narrow connector, crossing thin part.
    draw.ellipse((42 * scale, 205 * scale, 190 * scale, 315 * scale), fill=dark, outline=edge, width=3 * scale)
    draw.ellipse((72 * scale, 218 * scale, 156 * scale, 300 * scale), outline=edge, width=2 * scale)
    draw.polygon(_scaled_points([(150, 236), (238, 188), (246, 198), (158, 250)], scale), fill=dark, outline=edge)
    draw.line(_scaled_points([(218, 192), (360, 102)], scale), fill=edge, width=4 * scale)
    draw.line(_scaled_points([(58, 235), (345, 115)], scale), fill=(188, 190, 194), width=2 * scale)
    draw.line(_scaled_points([(64, 255), (330, 140)], scale), fill=edge, width=2 * scale)

    # Enclosed accessory detail and a small intentional gap in the connector.
    draw.arc((96 * scale, 230 * scale, 142 * scale, 286 * scale), 40, 310, fill=(188, 190, 194), width=2 * scale)
    draw.line(_scaled_points([(188, 217), (202, 210)], scale), fill=edge, width=3 * scale)
    draw.line(_scaled_points([(213, 202), (226, 195)], scale), fill=edge, width=3 * scale)

    # Distant artifact that must remain excluded.
    draw.ellipse((345 * scale, 455 * scale, 353 * scale, 463 * scale), fill=(8, 9, 10))
    return image


def build_accessory_mask(scale: int) -> Image.Image:
    mask = Image.new("L", (400 * scale, 500 * scale), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((42 * scale, 205 * scale, 190 * scale, 315 * scale), fill=255)
    draw.polygon(_scaled_points([(150, 236), (238, 188), (246, 198), (158, 250)], scale), fill=255)
    draw.line(_scaled_points([(218, 192), (360, 102)], scale), fill=255, width=4 * scale)
    draw.line(_scaled_points([(58, 235), (345, 115)], scale), fill=255, width=2 * scale)
    draw.line(_scaled_points([(64, 255), (330, 140)], scale), fill=255, width=2 * scale)
    return mask


def main() -> None:
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    entries: list[dict[str, object]] = []
    for fixture_id, scale in (("compound-defining-accessory-low", 1), ("compound-defining-accessory-high", 2)):
        image = build_fixture(scale)
        path = SOURCE_DIR / f"{fixture_id}.png"
        image.save(path, format="PNG", optimize=False)
        accessory_mask_path = SOURCE_DIR / f"{fixture_id}-accessory-mask.png"
        build_accessory_mask(scale).save(accessory_mask_path, format="PNG", optimize=False)
        entries.append({
            "id": fixture_id,
            "path": path.relative_to(ROOT).as_posix(),
            "widthPx": image.width,
            "heightPx": image.height,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "accessoryMask": {
                "path": accessory_mask_path.relative_to(ROOT).as_posix(),
                "sha256": hashlib.sha256(accessory_mask_path.read_bytes()).hexdigest(),
            },
        })
    (ROOT / "generated-files.json").write_text(json.dumps({"fixtures": entries}, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
