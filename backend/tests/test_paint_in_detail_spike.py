from __future__ import annotations

import hashlib
import unittest
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

from backend.cutout_studio.pipeline import TemplateSettings, _subject_mask
from backend.cutout_studio.paint_in_detail_spike import build_paint_in_detail_proposal


FIXTURE_ROOT = Path(__file__).parents[2] / ".scratch" / "run6-accessory-investigation" / "sources"


def paint_mask(size: tuple[int, int], scale: int = 1) -> np.ndarray:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    strokes = [
        ([(60, 260), (160, 270)], 30),
        ([(150, 235), (238, 192)], 22),
        ([(62, 240), (345, 115)], 16),
    ]
    for points, width in strokes:
        draw.line([(x * scale, y * scale) for x, y in points], fill=255, width=width * scale, joint="curve")
    return np.asarray(mask, dtype=bool)


def region_pixels(mask: np.ndarray, box: tuple[int, int, int, int]) -> int:
    x1, y1, x2, y2 = box
    return int(np.count_nonzero(mask[y1:y2, x1:x2]))


class PaintInDetailSpikeTest(unittest.TestCase):
    def _run_fixture(self, filename: str, scale: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        source = np.asarray(Image.open(FIXTURE_ROOT / filename).convert("RGB"))
        settings = TemplateSettings(threshold=42, smoothing=2, speck_area=60, hole_area=220)
        authoritative = np.asarray(_subject_mask(Image.fromarray(source).convert("RGBA"), settings)) > 0
        painted = paint_mask((source.shape[1], source.shape[0]), scale)
        proposal = build_paint_in_detail_proposal(source, authoritative, painted)
        self.assertIsNotNone(proposal)
        assert proposal is not None
        self.assertEqual(proposal.detail_mask.shape, authoritative.shape)
        return proposal.detail_mask, authoritative, painted

    def test_low_resolution_paint_in_is_bounded_and_preserves_accessory_relationships(self) -> None:
        detail, authoritative, painted = self._run_fixture("compound-defining-accessory-low.png", 1)
        self.assertGreater(region_pixels(detail, (35, 198, 195, 320)), 120)
        self.assertGreater(region_pixels(detail, (145, 180, 255, 255)), 40)
        self.assertGreater(region_pixels(detail, (50, 90, 365, 260)), 160)
        self.assertLess(region_pixels(detail, (330, 440, 370, 480)), 10)
        self.assertEqual(np.count_nonzero(detail & ~painted), 0)
        self.assertGreater(np.count_nonzero(authoritative), 0)

    def test_high_resolution_paint_in_scales_with_the_same_relationships(self) -> None:
        detail, _authoritative, painted = self._run_fixture("compound-defining-accessory-high.png", 2)
        self.assertGreater(region_pixels(detail, (70, 396, 390, 640)), 480)
        self.assertGreater(region_pixels(detail, (290, 360, 510, 510)), 160)
        self.assertGreater(region_pixels(detail, (100, 180, 730, 520)), 640)
        self.assertLess(region_pixels(detail, (660, 880, 740, 960)), 40)
        self.assertEqual(np.count_nonzero(detail & ~painted), 0)

    def test_empty_paint_returns_no_proposal(self) -> None:
        source = np.asarray(Image.open(FIXTURE_ROOT / "compound-defining-accessory-low.png").convert("RGB"))
        settings = TemplateSettings()
        authoritative = np.asarray(_subject_mask(Image.fromarray(source).convert("RGBA"), settings)) > 0
        empty = np.zeros(authoritative.shape, dtype=bool)
        self.assertIsNone(build_paint_in_detail_proposal(source, authoritative, empty))

    def test_paint_in_does_not_modify_authoritative_mask(self) -> None:
        source = np.asarray(Image.open(FIXTURE_ROOT / "compound-defining-accessory-low.png").convert("RGB"))
        settings = TemplateSettings()
        authoritative = np.asarray(_subject_mask(Image.fromarray(source).convert("RGBA"), settings)) > 0
        digest = hashlib.sha256(authoritative.tobytes()).hexdigest()
        build_paint_in_detail_proposal(source, authoritative, paint_mask((source.shape[1], source.shape[0])))
        self.assertEqual(hashlib.sha256(authoritative.tobytes()).hexdigest(), digest)

    def test_straddling_paint_suppresses_both_sides_of_cutline_but_keeps_far_support_detail(self) -> None:
        source = np.asarray(Image.open(FIXTURE_ROOT / "compound-defining-accessory-low.png").convert("RGB"))
        settings = TemplateSettings()
        authoritative = np.asarray(_subject_mask(Image.fromarray(source).convert("RGBA"), settings)) > 0
        painted_image = Image.new("L", (source.shape[1], source.shape[0]), 0)
        draw = ImageDraw.Draw(painted_image)
        draw.line([(78, 260), (145, 260)], fill=255, width=16)
        draw.line([(38, 260), (62, 260)], fill=255, width=8)
        painted = np.asarray(painted_image) > 0
        proposal = build_paint_in_detail_proposal(source, authoritative, painted)
        self.assertIsNotNone(proposal)
        assert proposal is not None
        radius = max(3, round(min(source.shape[:2]) * 0.01))
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1, radius * 2 + 1))
        band = (cv2.dilate(authoritative.astype(np.uint8), kernel) > 0) & (
            cv2.erode(authoritative.astype(np.uint8), kernel) == 0
        )
        self.assertEqual(np.count_nonzero(proposal.detail_mask[band]), 0)
        self.assertGreater(np.count_nonzero(proposal.detail_mask[painted & ~band]), 0)


if __name__ == "__main__":
    unittest.main()
