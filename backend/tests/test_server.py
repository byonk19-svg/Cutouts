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


class ApiServerTestCase(unittest.TestCase):
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

    def _request(
        self,
        method: str,
        path: str,
        *,
        body: bytes | None = None,
        headers: dict[str, str] | None = None,
        auto_content_length: bool = True,
    ) -> tuple[http.client.HTTPResponse, bytes]:
        request_headers = dict(headers or {})
        if body is not None and auto_content_length and "Content-Length" not in request_headers:
            request_headers["Content-Length"] = str(len(body))
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=15)
        connection.putrequest(method, path)
        for key, value in request_headers.items():
            connection.putheader(key, value)
        connection.endheaders()
        if body:
            connection.send(body)
        response = connection.getresponse()
        payload = response.read()
        connection.close()
        return response, payload

    def _post_json(
        self,
        path: str,
        payload: dict[str, object],
        *,
        headers: dict[str, str] | None = None,
    ) -> tuple[http.client.HTTPResponse, bytes]:
        request_headers = {"Content-Type": "application/json", **(headers or {})}
        return self._request(
            "POST",
            path,
            body=json.dumps(payload).encode("utf-8"),
            headers=request_headers,
        )


class LocalApiBoundaryTest(ApiServerTestCase):
    def test_allows_no_origin_local_json_request(self) -> None:
        response, body = self._post_json("/api/match-color", {"hex": "#112233"})

        self.assertEqual(response.status, 200)
        self.assertEqual(len(json.loads(body)["matches"]), 3)
        self.assertIsNone(response.headers.get("Access-Control-Allow-Origin"))

    def test_allows_local_origin_preflight_for_known_route(self) -> None:
        response, _body = self._request(
            "OPTIONS",
            "/api/analyze",
            headers={"Origin": "http://127.0.0.1:5173"},
        )

        self.assertEqual(response.status, 204)
        self.assertEqual(response.headers.get("Access-Control-Allow-Origin"), "http://127.0.0.1:5173")
        self.assertEqual(response.headers.get("Vary"), "Origin")
        self.assertNotEqual(response.headers.get("Access-Control-Allow-Origin"), "*")

    def test_rejects_preflight_from_unapproved_origin(self) -> None:
        response, body = self._request(
            "OPTIONS",
            "/api/analyze",
            headers={"Origin": "https://evil.example"},
        )

        self.assertEqual(response.status, 403)
        self.assertEqual(json.loads(body), {"error": "Origin is not allowed."})
        self.assertIsNone(response.headers.get("Access-Control-Allow-Origin"))

    def test_rejects_preflight_for_unknown_route(self) -> None:
        response, body = self._request(
            "OPTIONS",
            "/api/not-a-route",
            headers={"Origin": "http://localhost:5173"},
        )

        self.assertEqual(response.status, 404)
        self.assertEqual(json.loads(body), {"error": "Not found"})
        self.assertEqual(response.headers.get("Access-Control-Allow-Origin"), "http://localhost:5173")

    def test_unknown_post_route_returns_404_before_body_parsing(self) -> None:
        response, body = self._request(
            "POST",
            "/api/not-a-route",
            headers={
                "Content-Type": "multipart/form-data; boundary=cutout-studio-api-test",
                "Content-Length": "not-a-number",
            },
            auto_content_length=False,
        )

        self.assertEqual(response.status, 404)
        self.assertEqual(json.loads(body), {"error": "Not found"})

    def test_rejects_missing_content_length(self) -> None:
        response, body = self._request(
            "POST",
            "/api/match-color",
            headers={"Content-Type": "application/json"},
            auto_content_length=False,
        )

        self.assertEqual(response.status, 400)
        self.assertEqual(json.loads(body), {"error": "Content-Length header is required."})

    def test_rejects_invalid_content_length(self) -> None:
        response, body = self._request(
            "POST",
            "/api/match-color",
            headers={
                "Content-Type": "application/json",
                "Content-Length": "abc",
            },
            auto_content_length=False,
        )

        self.assertEqual(response.status, 400)
        self.assertEqual(json.loads(body), {"error": "Content-Length header must be a non-negative integer."})

    def test_rejects_negative_content_length(self) -> None:
        response, body = self._request(
            "POST",
            "/api/match-color",
            headers={
                "Content-Type": "application/json",
                "Content-Length": "-1",
            },
            auto_content_length=False,
        )

        self.assertEqual(response.status, 400)
        self.assertEqual(json.loads(body), {"error": "Content-Length header must be a non-negative integer."})

    def test_rejects_oversized_json_request_before_reading(self) -> None:
        response, body = self._request(
            "POST",
            "/api/match-color",
            headers={
                "Content-Type": "application/json",
                "Content-Length": str(64 * 1024 + 1),
            },
            auto_content_length=False,
        )

        self.assertEqual(response.status, 413)
        self.assertEqual(json.loads(body), {"error": "Request body exceeds the 64 KiB limit."})

    def test_rejects_oversized_multipart_request_before_reading(self) -> None:
        response, body = self._request(
            "POST",
            "/api/analyze",
            headers={
                "Content-Type": "multipart/form-data; boundary=cutout-studio-api-test",
                "Content-Length": str(25 * 1024 * 1024 + 1),
            },
            auto_content_length=False,
        )

        self.assertEqual(response.status, 413)
        self.assertEqual(json.loads(body), {"error": "Request body exceeds the 25 MiB limit."})

    @patch("backend.cutout_studio.server.analyze_template")
    def test_rejects_unapproved_origin_before_analysis(self, analyze) -> None:
        response, body = self._request(
            "POST",
            "/api/analyze",
            headers={
                "Origin": "https://evil.example",
                "Content-Type": "multipart/form-data; boundary=cutout-studio-api-test",
            },
            auto_content_length=False,
        )

        self.assertEqual(response.status, 403)
        self.assertEqual(json.loads(body), {"error": "Origin is not allowed."})
        analyze.assert_not_called()

    @patch("backend.cutout_studio.server.build_template_pdf")
    def test_rejects_unapproved_origin_before_export(self, build_pdf) -> None:
        response, body = self._request(
            "POST",
            "/api/export",
            headers={
                "Origin": "https://evil.example",
                "Content-Type": "multipart/form-data; boundary=cutout-studio-api-test",
            },
            auto_content_length=False,
        )

        self.assertEqual(response.status, 403)
        self.assertEqual(json.loads(body), {"error": "Origin is not allowed."})
        build_pdf.assert_not_called()

    @patch("backend.cutout_studio.server.generate_linework_proposal")
    def test_rejects_unapproved_origin_before_provider_request(self, generate) -> None:
        response, body = self._request(
            "POST",
            "/api/generate-linework",
            headers={
                "Origin": "https://evil.example",
                "Content-Type": "multipart/form-data; boundary=cutout-studio-api-test",
            },
            auto_content_length=False,
        )

        self.assertEqual(response.status, 403)
        self.assertEqual(json.loads(body), {"error": "Origin is not allowed."})
        generate.assert_not_called()

    @patch("backend.cutout_studio.server.match_paint_hex", side_effect=RuntimeError("SENTINEL exception text"))
    def test_returns_generic_500_without_exception_text(self, _match_paint_hex) -> None:
        response, body = self._post_json("/api/match-color", {"hex": "#112233"})
        payload = json.loads(body)

        self.assertEqual(response.status, 500)
        self.assertEqual(payload, {"error": "Unexpected server error."})
        self.assertNotIn("SENTINEL", body.decode("utf-8"))


class GenerateLineworkApiTest(ApiServerTestCase):
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
        origin: str | None = None,
    ) -> tuple[http.client.HTTPResponse, bytes]:
        if image is None:
            image = Image.new("RGB", (64, 96), "white")
            ImageDraw.Draw(image).ellipse((8, 8, 56, 88), fill="black")
        body, content_type = _multipart_body({
            "image": ("source.png", _png_bytes(image), "image/png"),
            "settings": json.dumps({"finishedHeightIn": 24, "detailExtractionMode": detail_extraction_mode}),
            "confirmation": json.dumps(confirmation),
        })
        headers = {"Content-Type": content_type}
        if origin is not None:
            headers["Origin"] = origin
        return self._request("POST", "/api/generate-linework", body=body, headers=headers)


class ReinforceCutlineApiTest(ApiServerTestCase):
    def test_returns_review_only_cutline_proposal(self) -> None:
        source = Image.new("RGBA", (246, 581), (255, 255, 255, 0))
        draw = ImageDraw.Draw(source)
        draw.ellipse((72, 20, 174, 150), outline=(0, 0, 0, 255), width=3)
        draw.line((123, 151, 123, 410), fill=(0, 0, 0, 255), width=3)
        draw.line((25, 245, 221, 245), fill=(0, 0, 0, 255), width=3)
        draw.line((123, 410, 42, 558), fill=(0, 0, 0, 255), width=3)
        draw.line((123, 410, 212, 558), fill=(0, 0, 0, 255), width=3)

        response, body = self._post_reinforcement(source, 0.50)
        payload = json.loads(body)

        self.assertEqual(response.status, 200)
        self.assertEqual(payload["minimumWidthIn"], 0.50)
        self.assertTrue(payload["outerCutPath"].startswith("M "))
        self.assertTrue(payload["outerLinePngDataUrl"].startswith("data:image/png;base64,"))
        self.assertGreater(payload["previewWidthPx"], 0)
        self.assertGreater(payload["previewHeightPx"], 0)
        self.assertLessEqual(payload["previewWidthPx"], source.width)
        self.assertLessEqual(payload["previewHeightPx"], source.height)
        self.assertIn("componentsJoined", payload["topologyChanges"])
        self.assertIn("gapMergeWarning", payload["topologyChanges"])

    def test_rejects_width_outside_review_range(self) -> None:
        source = Image.new("RGBA", (64, 96), (255, 255, 255, 0))
        ImageDraw.Draw(source).line((32, 8, 32, 88), fill=(0, 0, 0, 255), width=1)

        response, body = self._post_reinforcement(source, 0.80)

        self.assertEqual(response.status, 400)
        self.assertIn("between 0.25 and 0.75", json.loads(body)["error"])

    def _post_reinforcement(self, image: Image.Image, minimum_width_in: float) -> tuple[http.client.HTTPResponse, bytes]:
        body, content_type = _multipart_body({
            "image": ("source.png", _png_bytes(image), "image/png"),
            "settings": json.dumps({"finishedHeightIn": 36}),
            "minimumWidthIn": str(minimum_width_in),
        })
        return self._request(
            "POST",
            "/api/reinforce-cutline",
            body=body,
            headers={"Content-Type": content_type},
        )


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
