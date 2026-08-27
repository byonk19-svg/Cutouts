from __future__ import annotations

import io
import unittest

import numpy as np
from PIL import Image, ImageDraw
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from backend.cutout_studio.detail_quality_diagnostics import (
    analyze_linework,
    build_report,
    compare_linework,
    load_linework_images,
)


def clean_linework() -> Image.Image:
    image = Image.new("L", (240, 180), 255)
    draw = ImageDraw.Draw(image)
    draw.line([(24, 28), (216, 28)], fill=0, width=3)
    draw.line([(24, 72), (216, 72)], fill=0, width=3)
    draw.line([(24, 116), (216, 116)], fill=0, width=3)
    return image


def thick_banded_linework() -> Image.Image:
    image = Image.new("L", (240, 180), 255)
    draw = ImageDraw.Draw(image)
    draw.line([(24, 28), (216, 28)], fill=0, width=18)
    draw.line([(24, 72), (216, 72)], fill=0, width=14)
    draw.line([(24, 116), (216, 116)], fill=0, width=12)
    return image


def jagged_linework() -> Image.Image:
    image = Image.new("L", (240, 180), 255)
    draw = ImageDraw.Draw(image)
    points = [(20, 30), (42, 20), (58, 34), (76, 18), (94, 35), (112, 20), (130, 34), (148, 19), (166, 34), (184, 20), (216, 30), (216, 130), (20, 130)]
    draw.polygon(points, fill=0)
    return image


def pdf_with_trace_images() -> bytes:
    output = io.BytesIO()
    document = canvas.Canvas(output, pagesize=letter)
    for image in (clean_linework(), thick_banded_linework()):
        image_buffer = io.BytesIO()
        image.save(image_buffer, format="PNG")
        image_buffer.seek(0)
        document.drawImage(ImageReader(image_buffer), 0, 0, width=letter[0], height=letter[1], preserveAspectRatio=False)
        document.showPage()
    document.save()
    return output.getvalue()


class DetailQualityDiagnosticsTest(unittest.TestCase):
    def test_thick_bands_have_higher_effective_width_and_ink_density(self) -> None:
        clean = analyze_linework(clean_linework())
        banded = analyze_linework(thick_banded_linework())

        self.assertGreater(banded.width_p90_px, clean.width_p90_px * 2)
        self.assertGreater(banded.ink_density, clean.ink_density * 2)
        self.assertGreater(banded.broad_ink_fraction, clean.broad_ink_fraction)

    def test_jagged_boundary_has_higher_complexity(self) -> None:
        clean = analyze_linework(clean_linework())
        jagged = analyze_linework(jagged_linework())

        self.assertGreater(jagged.boundary_complexity, clean.boundary_complexity)

    def test_compare_reports_directional_deltas(self) -> None:
        comparison = compare_linework(clean_linework(), thick_banded_linework())

        self.assertGreater(comparison["widthP90DeltaPx"], 0)
        self.assertGreater(comparison["inkDensityDelta"], 0)
        self.assertGreater(comparison["broadInkFractionDelta"], 0)

    def test_pdf_loader_returns_each_trace_raster(self) -> None:
        images = load_linework_images(pdf_with_trace_images())

        self.assertEqual(len(images), 2)
        self.assertEqual(images[0].size, (612, 792))
        self.assertEqual(images[1].size, (612, 792))

    def test_report_aggregates_page_metrics_without_claiming_a_verdict(self) -> None:
        report = build_report(pdf_with_trace_images())

        self.assertEqual(report["pageCount"], 2)
        self.assertIn("widthP90MedianPx", report["aggregate"])
        self.assertIn("broadInkFractionMedian", report["aggregate"])
        self.assertNotIn("pass", report)


if __name__ == "__main__":
    unittest.main()
