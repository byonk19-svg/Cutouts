import http.client
import io
import json
import threading
import unittest
from unittest.mock import patch

from PIL import Image, ImageDraw

from backend.cutout_studio.ai_linework import LineworkProposal
from backend.cutout_studio.server import CutoutStudioHandler, ThreadingHTTPServer, _parse_multipart


class MultipartParserTest(unittest.TestCase):
    def test_parser_preserves_binary_file_trailing_newline_byte(self) -> None:
        boundary = "cutout-boundary"
        image_bytes = b"\x89PNG\r\nfixture-bytes\n"
        body = (
            b"--cutout-boundary\r\n"
            b'Content-Disposition: form-data; name="image"; filename="fixture.png"\r\n'
            b"Content-Type: image/png\r\n\r\n"
            + image_bytes
            + b"\r\n--cutout-boundary\r\n"
            b'Content-Disposition: form-data; name="settings"\r\n\r\n'
            b'{"finishedHeightIn":24}'
            b"\r\n--cutout-boundary--\r\n"
        )

        fields = _parse_multipart(body, f"multipart/form-data; boundary={boundary}")

        self.assertEqual(fields["image"], image_bytes)
        self.assertEqual(fields["settings"], b'{"finishedHeightIn":24}')


class GenerateLineworkApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), CutoutStudioHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    @patch("backend.cutout_studio.server.generate_linework_proposal")
    def test_requires_exact_upload_and_cost_confirmation_before_generation(self, generate) -> None:
        response, body = self._post_linework({"uploadConfirmed": False, "estimatedCostUsd": 0.10})

        self.assertEqual(response.status, 400)
        self.assertIn("confirm", json.loads(body)["error"].lower())
        generate.assert_not_called()

    @patch("backend.cutout_studio.server.generate_linework_proposal")
    def test_returns_credential_free_proposal_contract_without_apply_authority(self, generate) -> None:
        preview = _png_bytes(Image.new("RGB", (64, 96), "white"))
        detail = _png_bytes(Image.new("RGBA", (64, 96), (0, 0, 0, 0)))
        generate.return_value = LineworkProposal(
            preview_png=preview,
            detail_png=detail,
            status="review-only",
            validation_issues=("dense",),
            ink_coverage=0.31,
            suppressed_pixel_count=42,
            preview_size=(64, 96),
            provider_output_size=(1024, 1536),
        )

        response, body = self._post_linework({"uploadConfirmed": True, "estimatedCostUsd": 0.10})
        payload = json.loads(body)

        self.assertEqual(response.status, 200)
        self.assertEqual(generate.call_count, 1)
        self.assertEqual(payload["status"], "review-only")
        self.assertEqual(payload["validationIssues"], ["dense"])
        self.assertFalse(payload["canReplaceAcceptedDetail"])
        self.assertEqual(payload["provider"], "openai")
        self.assertEqual(payload["previewWidthPx"], 64)
        self.assertEqual(payload["previewHeightPx"], 96)
        self.assertTrue(payload["proposalPreviewPngDataUrl"].startswith("data:image/png;base64,"))
        self.assertTrue(payload["proposalDetailPngDataUrl"].startswith("data:image/png;base64,"))

    @patch("backend.cutout_studio.server.generate_linework_proposal")
    def test_accepts_local_line_art_sources_at_the_api_seam(self, generate) -> None:
        preview = _png_bytes(Image.new("RGB", (64, 96), "white"))
        detail = _png_bytes(Image.new("RGBA", (64, 96), (0, 0, 0, 0)))
        generate.return_value = LineworkProposal(
            preview_png=preview,
            detail_png=detail,
            status="pending-review",
            validation_issues=(),
            ink_coverage=0.04,
            suppressed_pixel_count=0,
            preview_size=(64, 96),
            provider_output_size=(1024, 1536),
        )
        response, body = self._post_linework(
            {"uploadConfirmed": True, "estimatedCostUsd": 0.10},
            detail_extraction_mode="lineArt",
        )

        self.assertEqual(response.status, 200)
        self.assertEqual(json.loads(body)["status"], "pending-review")
        generate.assert_called_once()

    @patch("backend.cutout_studio.server.generate_linework_proposal")
    def test_sends_the_cropped_analysis_preview_to_the_provider(self, generate) -> None:
        source = Image.new("RGB", (240, 120), "white")
        ImageDraw.Draw(source).ellipse((84, 24, 156, 96), fill="black")

        def capture_provider_input(
            provider_input: bytes,
            protected_cutline: bytes,
            *,
            preview_size: tuple[int, int],
            upload_confirmed: bool,
            confirmed_estimate_usd: float,
        ) -> LineworkProposal:
            with Image.open(io.BytesIO(provider_input)) as image:
                self.assertEqual(image.size, preview_size)
                self.assertLess(image.width, source.width)
            with Image.open(io.BytesIO(protected_cutline)) as image:
                self.assertEqual(image.size, preview_size)
            return LineworkProposal(
                preview_png=_png_bytes(Image.new("RGB", preview_size, "white")),
                detail_png=_png_bytes(Image.new("RGBA", preview_size, (0, 0, 0, 0))),
                status="pending-review",
                validation_issues=(),
                ink_coverage=0.04,
                suppressed_pixel_count=0,
                preview_size=preview_size,
                provider_output_size=(1024, 1536),
            )

        generate.side_effect = capture_provider_input
        response, _body = self._post_linework(
            {"uploadConfirmed": True, "estimatedCostUsd": 0.10},
            image=source,
        )

        self.assertEqual(response.status, 200)
        generate.assert_called_once()

    def _post_linework(
        self,
        confirmation: dict[str, object],
        *,
        detail_extraction_mode: str = "rendered",
        image: Image.Image | None = None,
    ) -> tuple[http.client.HTTPResponse, bytes]:
        if image is None:
            image = Image.new("RGB", (64, 96), "white")
            ImageDraw.Draw(image).ellipse((8, 8, 56, 88), fill="black")
        body, content_type = _multipart_body({
            "image": ("source.png", _png_bytes(image), "image/png"),
            "settings": json.dumps({"finishedHeightIn": 24, "detailExtractionMode": detail_extraction_mode}),
            "confirmation": json.dumps(confirmation),
        })
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=15)
        connection.request("POST", "/api/generate-linework", body=body, headers={"Content-Type": content_type})
        response = connection.getresponse()
        payload = response.read()
        connection.close()
        return response, payload


def _png_bytes(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _multipart_body(fields: dict[str, str | tuple[str, bytes, str]]) -> tuple[bytes, str]:
    boundary = "cutout-studio-api-test"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.append(f"--{boundary}\r\n".encode())
        if isinstance(value, tuple):
            filename, data, mime_type = value
            chunks.append(
                f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\nContent-Type: {mime_type}\r\n\r\n'.encode()
            )
            chunks.append(data)
        else:
            chunks.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n{value}'.encode())
        chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


if __name__ == "__main__":
    unittest.main()
