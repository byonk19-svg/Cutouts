from __future__ import annotations

import base64
import io
import json
import unittest
from unittest.mock import MagicMock, patch

from PIL import Image, ImageDraw

from backend.cutout_studio.ai_linework import (
    CONFIRMED_ESTIMATE_USD,
    LineworkGenerationError,
    generate_linework_proposal,
    normalize_generated_proposal,
    wood_transfer_prompt,
)


def png_bytes(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def protected_cutline(size: tuple[int, int] = (100, 100), *, include_small_component: bool = False) -> bytes:
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rectangle((8, 8, size[0] - 9, size[1] - 9), outline=(0, 0, 0, 255), width=1)
    if include_small_component:
        draw.ellipse((44, 44, 56, 56), outline=(0, 0, 0, 255), width=1)
    return png_bytes(image)


class NormalizeGeneratedProposalTest(unittest.TestCase):
    def test_alpha_composites_output_and_returns_preview_sized_transparent_black_detail(self) -> None:
        generated = Image.new("RGBA", (200, 200), (0, 0, 0, 0))
        generated_draw = ImageDraw.Draw(generated)
        generated_draw.line((100, 50, 100, 150), fill=(0, 0, 0, 255), width=6)
        generated_draw.line((32, 50, 32, 150), fill=(0, 0, 0, 255), width=6)

        proposal = normalize_generated_proposal(
            png_bytes(generated),
            expected_generated_size=(200, 200),
            preview_size=(100, 100),
            protected_cutline_png=protected_cutline(),
        )

        self.assertEqual(proposal.status, "pending-review")
        self.assertEqual(proposal.validation_issues, ())
        preview = Image.open(io.BytesIO(proposal.preview_png))
        detail = Image.open(io.BytesIO(proposal.detail_png)).convert("RGBA")
        self.assertEqual(preview.size, (100, 100))
        self.assertEqual(detail.size, (100, 100))
        self.assertEqual(detail.getpixel((50, 50)), (0, 0, 0, 255))
        self.assertEqual(detail.getpixel((0, 0)), (0, 0, 0, 0))
        self.assertEqual(preview.convert("RGB").getpixel((50, 50)), (0, 0, 0))
        self.assertEqual(preview.convert("RGB").getpixel((16, 50)), (255, 255, 255))

    def test_exterior_component_band_24_suppresses_only_near_largest_cutline_component(self) -> None:
        generated = Image.new("RGB", (100, 100), "white")
        draw = ImageDraw.Draw(generated)
        draw.line((10, 15, 10, 85), fill="black", width=2)
        draw.line((42, 40, 42, 60), fill="black", width=2)

        proposal = normalize_generated_proposal(
            png_bytes(generated),
            expected_generated_size=(100, 100),
            preview_size=(100, 100),
            protected_cutline_png=protected_cutline(include_small_component=True),
        )

        detail = Image.open(io.BytesIO(proposal.detail_png)).convert("RGBA")
        self.assertEqual(detail.getpixel((10, 50))[3], 0)
        self.assertEqual(detail.getpixel((42, 50))[3], 255)
        self.assertGreater(proposal.suppressed_pixel_count, 0)

    def test_invalid_outputs_are_review_only(self) -> None:
        cases: list[tuple[str, bytes, tuple[int, int], bytes, str]] = []
        cases.append(("malformed", b"not-an-image", (100, 100), protected_cutline(), "malformed"))
        cases.append(("wrong-size", png_bytes(Image.new("RGB", (80, 100), "white")), (100, 100), protected_cutline(), "wrong-size"))
        cases.append(("blank", png_bytes(Image.new("RGB", (100, 100), "white")), (100, 100), protected_cutline(), "blank"))
        cases.append(("dense", png_bytes(Image.new("RGB", (100, 100), "black")), (100, 100), protected_cutline(), "dense"))
        cases.append(("missing-cutline", png_bytes(Image.new("RGB", (100, 100), "white")), (100, 100), png_bytes(Image.new("RGBA", (100, 100), (0, 0, 0, 0))), "missing-cutline"))

        noisy = Image.new("RGB", (100, 100), "white")
        noisy_draw = ImageDraw.Draw(noisy)
        for y in range(30, 80, 4):
            for x in range(30, 80, 4):
                noisy_draw.point((x, y), fill="black")
        cases.append(("noisy", png_bytes(noisy), (100, 100), protected_cutline(), "noisy"))

        duplicate = Image.new("RGB", (100, 100), "white")
        ImageDraw.Draw(duplicate).rectangle((34, 34, 65, 65), outline="black", width=2)
        cases.append(("duplicate-contour", png_bytes(duplicate), (100, 100), protected_cutline(), "duplicate-contour"))

        for name, generated, expected_size, cutline, issue in cases:
            with self.subTest(name=name):
                proposal = normalize_generated_proposal(
                    generated,
                    expected_generated_size=expected_size,
                    preview_size=(100, 100),
                    protected_cutline_png=cutline,
                )
                self.assertEqual(proposal.status, "review-only")
                self.assertIn(issue, proposal.validation_issues)
                self.assertFalse(proposal.can_replace_accepted_detail)


class GenerateLineworkProposalTest(unittest.TestCase):
    def test_prompt_requires_the_complete_foreground_composition_and_major_props(self) -> None:
        prompt = wood_transfer_prompt().lower()

        self.assertIn("complete foreground composition", prompt)
        self.assertIn("major foreground prop", prompt)
        self.assertIn("do not omit", prompt)

    @patch("backend.cutout_studio.ai_linework.urlopen")
    def test_unconfirmed_request_is_rejected_before_provider_transport(self, mock_urlopen: MagicMock) -> None:
        with self.assertRaisesRegex(LineworkGenerationError, "(?i)confirm"):
            generate_linework_proposal(
                png_bytes(Image.new("RGB", (100, 100), "white")),
                protected_cutline(),
                preview_size=(100, 100),
                upload_confirmed=False,
                confirmed_estimate_usd=CONFIRMED_ESTIMATE_USD,
            )
        mock_urlopen.assert_not_called()

    @patch.dict("os.environ", {"OPENAI_API_KEY": "test-only-key"})
    @patch("backend.cutout_studio.ai_linework.urlopen")
    def test_confirmed_request_posts_once_without_retry_and_normalizes_response(self, mock_urlopen: MagicMock) -> None:
        generated = Image.new("RGB", (1024, 1536), "white")
        ImageDraw.Draw(generated).line((512, 500, 512, 1000), fill="black", width=12)
        response = MagicMock()
        response.read.return_value = json.dumps({
            "data": [{"b64_json": base64.b64encode(png_bytes(generated)).decode("ascii")}]
        }).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = response

        proposal = generate_linework_proposal(
            png_bytes(Image.new("RGBA", (100, 150), (255, 255, 255, 128))),
            protected_cutline((100, 150)),
            preview_size=(100, 150),
            upload_confirmed=True,
            confirmed_estimate_usd=CONFIRMED_ESTIMATE_USD,
        )

        self.assertEqual(mock_urlopen.call_count, 1)
        request = mock_urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "https://api.openai.com/v1/images/edits")
        self.assertIn(b'gpt-image-1.5', request.data)
        self.assertIn(b'1024x1536', request.data)
        self.assertIn(b'wood-transfer', request.data.lower())
        self.assertEqual(proposal.status, "pending-review")
        self.assertFalse(proposal.can_replace_accepted_detail)
        self.assertEqual(proposal.provider, "openai")


if __name__ == "__main__":
    unittest.main()
