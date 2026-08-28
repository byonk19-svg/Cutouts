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
    build_pdf_layer_report,
    compare_linework,
    load_pdf_layers,
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
    for page_number, image in enumerate((clean_linework(), thick_banded_linework()), start=1):
        image_buffer = io.BytesIO()
        image.save(image_buffer, format="PNG")
        image_buffer.seek(0)
        document.setFont("Helvetica", 10)
        document.drawString(24, 770, f"Page {page_number} of 2")
        document.drawString(24, 756, f"Row 1 / Column {page_number}")
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

    def test_report_records_trace_and_pdf_page_metadata_and_maxima(self) -> None:
        report = build_report(pdf_with_trace_images())

        self.assertEqual(report["pages"][0]["tracePageIndex"], 1)
        self.assertEqual(report["pages"][0]["pdfPageIndex"], 1)
        self.assertEqual(report["pages"][0]["row"], 1)
        self.assertEqual(report["pages"][0]["column"], 1)
        self.assertEqual(report["pages"][1]["column"], 2)
        self.assertTrue(report["pages"][1]["isMaxWidthP90"])
        self.assertTrue(report["pages"][1]["isMaxBroadInk"])
        self.assertTrue(all("isMaxComplexity" in page for page in report["pages"]))

    def test_pdf_layers_separate_complete_furniture_and_trace_raster(self) -> None:
        layers = load_pdf_layers(pdf_with_trace_images())

        self.assertEqual(len(layers), 2)
        self.assertEqual(layers[0]["complete"].size, (612, 792))
        self.assertEqual(layers[0]["furniture"].size, (612, 792))
        self.assertIsNotNone(layers[0]["trace"])
        self.assertLess(
            analyze_linework(layers[0]["furniture"]).ink_density,
            analyze_linework(layers[0]["complete"]).ink_density,
        )

    def test_pdf_layer_report_measures_each_available_layer(self) -> None:
        report = build_pdf_layer_report(pdf_with_trace_images())

        self.assertEqual(report["pageCount"], 2)
        self.assertIn("complete", report["pages"][0]["layers"])
        self.assertIn("furniture", report["pages"][0]["layers"])
        self.assertIn("trace", report["pages"][0]["layers"])
        self.assertIsNotNone(report["pages"][0]["layers"]["trace"])


if __name__ == "__main__":
    unittest.main()
