from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from PIL import Image
from pypdf import PdfReader

from backend.cutout_studio.pipeline import OVERLAP_IN, PRINT_DPI


def inspect_max_packet(pdf_path: Path, assembled_path: Path | None = None) -> dict[str, object]:
    reader = PdfReader(pdf_path)
    trace_pages = reader.pages[2:]
    trace_images = [page.images[0].image.convert("RGB") for page in trace_pages]
    overlap_px = round(OVERLAP_IN * PRINT_DPI)
    cover_text = reader.pages[0].extract_text() or ""
    grid_match = re.search(r"Trace pages: (\d+) columns x (\d+) rows", cover_text)
    if grid_match is None:
        raise ValueError("The packet cover does not declare its tile grid.")
    tile_cols, tile_rows = (int(value) for value in grid_match.groups())
    if len(trace_images) != tile_cols * tile_rows:
        raise ValueError("The packet trace-page count does not match its declared tile grid.")

    horizontal_matches = []
    for row in range(tile_rows):
        for col in range(tile_cols - 1):
            left = trace_images[row * tile_cols + col]
            right = trace_images[row * tile_cols + col + 1]
            common_height = min(left.height, right.height)
            horizontal_matches.append(
                left.crop((left.width - overlap_px, 0, left.width, common_height)).tobytes()
                == right.crop((0, 0, overlap_px, common_height)).tobytes()
            )

    vertical_matches = []
    for row in range(tile_rows - 1):
        for col in range(tile_cols):
            upper = trace_images[row * tile_cols + col]
            lower = trace_images[(row + 1) * tile_cols + col]
            common_width = min(upper.width, lower.width)
            vertical_matches.append(
                upper.crop((0, upper.height - overlap_px, common_width, upper.height)).tobytes()
                == lower.crop((0, 0, common_width, overlap_px)).tobytes()
            )

    if assembled_path is not None:
        assembled_path.parent.mkdir(parents=True, exist_ok=True)
        col_widths = [
            max(trace_images[row * tile_cols + col].width for row in range(tile_rows))
            for col in range(tile_cols)
        ]
        row_heights = [
            max(trace_images[row * tile_cols + col].height for col in range(tile_cols))
            for row in range(tile_rows)
        ]
        x_positions = [0]
        for col in range(1, tile_cols):
            x_positions.append(x_positions[-1] + col_widths[col - 1] - overlap_px)
        y_positions = [0]
        for row in range(1, tile_rows):
            y_positions.append(y_positions[-1] + row_heights[row - 1] - overlap_px)
        width = max(x_positions[col] + col_widths[col] for col in range(tile_cols))
        height = max(y_positions[row] + row_heights[row] for row in range(tile_rows))
        assembled = Image.new("RGB", (width, height), "white")
        for row in range(tile_rows):
            for col in range(tile_cols):
                assembled.paste(trace_images[row * tile_cols + col], (x_positions[col], y_positions[row]))
        assembled.save(assembled_path, format="PNG")

    cover_stream = reader.pages[0].get_contents().get_data().decode("latin-1")
    paint_text = reader.pages[1].extract_text() or ""
    expected_paint_labels = [
        "Max fur",
        "Black outlines and facial details",
        "Antler",
        "Ears and pupils",
        "Eyes",
    ]
    media_boxes = [[float(value) for value in page.mediabox] for page in reader.pages]
    trace_black_and_white = all(
        all(red == green == blue for red, green, blue in image.get_flattened_data())
        for image in trace_images
    )

    return {
        "pageCount": len(reader.pages),
        "tracePageCount": len(trace_pages),
        "tileGrid": {"columns": tile_cols, "rows": tile_rows},
        "mediaBoxes": media_boxes,
        "allTracePagesLetter": all(box == [0.0, 0.0, 612.0, 792.0] for box in media_boxes[2:]),
        "traceBlackAndWhite": trace_black_and_white,
        "genericPaintLabelsPresent": re.search(r"\bColor \d+\b", paint_text) is not None,
        "paintLabelsPresent": {
            label: label in paint_text
            for label in expected_paint_labels
        },
        "calibrationSquarePoints": 72 if "n 40 25.2 72 72 re S" in cover_stream else None,
        "horizontalOverlapMatches": horizontal_matches,
        "verticalOverlapMatches": vertical_matches,
        "allOverlapsMatch": all(horizontal_matches) and all(vertical_matches),
        "assembledPixels": (
            list(Image.open(assembled_path).size)
            if assembled_path is not None
            else None
        ),
    }


if __name__ == "__main__":
    pdf = Path(sys.argv[1])
    assembled = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    print(json.dumps(inspect_max_packet(pdf, assembled), indent=2))
