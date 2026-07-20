from __future__ import annotations

import base64
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from .ai_linework import CONFIRMED_ESTIMATE_USD, generate_linework_proposal
from .pipeline import TemplateSettings, analyze_template, build_template_pdf, match_paint_hex


HOST = "127.0.0.1"
PORT = 8787


class CutoutStudioHandler(BaseHTTPRequestHandler):
    server_version = "CutoutStudio/0.1"

    def do_OPTIONS(self) -> None:
        self._send_empty(204)

    def do_GET(self) -> None:
        if self.path == "/api/health":
            self._send_json({"ok": True})
            return
        self._send_json({"error": "Not found"}, status=404)

    def do_POST(self) -> None:
        try:
            if self.path == "/api/match-color":
                self._handle_match_color()
                return
            if self.path == "/api/generate-linework":
                self._handle_generate_linework()
                return
            image_bytes, settings, edited_detail = self._read_template_request()
            if self.path == "/api/analyze":
                analysis = analyze_template(image_bytes, settings)
                self._send_json(analysis.to_json())
                return
            if self.path == "/api/export":
                pdf = build_template_pdf(image_bytes, settings, edited_detail_png=edited_detail)
                self._send_bytes(
                    pdf,
                    content_type="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="cutout-template-pack.pdf"'},
                )
                return
            self._send_json({"error": "Not found"}, status=404)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=400)
        except Exception as exc:
            self._send_json({"error": f"Unexpected server error: {exc}"}, status=500)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"{self.address_string()} - {format % args}")

    def _read_template_request(self) -> tuple[bytes, TemplateSettings, bytes | None]:
        form = self._read_template_form()
        image_bytes, settings = self._image_and_settings(form)
        return image_bytes, settings, form.get("editedDetail")

    def _read_template_form(self) -> dict[str, bytes]:
        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("multipart/form-data"):
            raise ValueError("Request must be multipart/form-data.")

        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        return _parse_multipart(body, content_type)

    def _image_and_settings(self, form: dict[str, bytes]) -> tuple[bytes, TemplateSettings]:
        image_bytes = form.get("image")
        if not image_bytes:
            raise ValueError("An image file is required.")
        settings_payload = form.get("settings", b"{}").decode("utf-8")
        try:
            settings_data = json.loads(settings_payload)
        except json.JSONDecodeError as exc:
            raise ValueError("Settings must be valid JSON.") from exc
        return image_bytes, TemplateSettings.from_mapping(settings_data)

    def _handle_generate_linework(self) -> None:
        form = self._read_template_form()
        image_bytes, settings = self._image_and_settings(form)
        try:
            confirmation = json.loads(form.get("confirmation", b"{}").decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError("AI proposal confirmation must be valid JSON.") from exc
        if not isinstance(confirmation, dict):
            raise ValueError("AI proposal confirmation must be an object.")
        upload_confirmed = confirmation.get("uploadConfirmed") is True
        confirmed_estimate = confirmation.get("estimatedCostUsd")
        if not upload_confirmed or confirmed_estimate != CONFIRMED_ESTIMATE_USD:
            raise ValueError(
                f"Confirm the source-image upload and exact ${CONFIRMED_ESTIMATE_USD:.2f} estimate before generating."
            )

        analysis = analyze_template(image_bytes, settings)
        if not analysis.outer_cut_path.strip():
            raise ValueError("A valid Cut Line is required before generating an AI proposal.")
        proposal = generate_linework_proposal(
            # Keep the provider request in the same cropped preview space as
            # the protected Cut Line, editor, and proposal normalization.
            analysis.paint_guide_png,
            analysis.outer_line_png,
            preview_size=(analysis.preview_width_px, analysis.preview_height_px),
            upload_confirmed=True,
            confirmed_estimate_usd=CONFIRMED_ESTIMATE_USD,
        )
        self._send_json(
            {
                "status": proposal.status,
                "validationIssues": list(proposal.validation_issues),
                "canReplaceAcceptedDetail": proposal.can_replace_accepted_detail,
                "proposalPreviewPngDataUrl": _png_data_url(proposal.preview_png),
                "proposalDetailPngDataUrl": _png_data_url(proposal.detail_png),
                "inkCoverage": proposal.ink_coverage,
                "suppressedPixelCount": proposal.suppressed_pixel_count,
                "previewWidthPx": proposal.preview_size[0],
                "previewHeightPx": proposal.preview_size[1],
                "providerOutputWidthPx": proposal.provider_output_size[0] if proposal.provider_output_size else None,
                "providerOutputHeightPx": proposal.provider_output_size[1] if proposal.provider_output_size else None,
                "model": proposal.model,
                "provider": proposal.provider,
                "estimatedCostUsd": proposal.estimated_cost_usd,
            }
        )

    def _handle_match_color(self) -> None:
        content_type = self.headers.get("Content-Type", "")
        if "application/json" not in content_type:
            raise ValueError("Color match request must be application/json.")
        length = int(self.headers.get("Content-Length", "0"))
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError("Color match request must be valid JSON.") from exc
        hex_value = str(payload.get("hex", ""))
        self._send_json({"matches": match_paint_hex(hex_value)})

    def _send_empty(self, status: int) -> None:
        self.send_response(status)
        self._send_common_headers()
        self.end_headers()

    def _send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self._send_bytes(body, "application/json", status=status)

    def _send_bytes(
        self,
        body: bytes,
        content_type: str,
        status: int = 200,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.send_response(status)
        self._send_common_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def _send_common_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")


def _parse_multipart(body: bytes, content_type: str) -> dict[str, bytes]:
    boundary_token = "boundary="
    if boundary_token not in content_type:
        raise ValueError("Multipart boundary is missing.")
    boundary = content_type.split(boundary_token, 1)[1].strip().strip('"')
    delimiter = ("--" + boundary).encode("utf-8")
    fields: dict[str, bytes] = {}

    for raw_part in body.split(delimiter):
        part = raw_part
        if not part or part in (b"--", b"--\r\n"):
            continue
        if part.startswith(b"\r\n"):
            part = part[2:]
        if part.endswith(b"--\r\n"):
            part = part[:-4]
        if part.endswith(b"--"):
            part = part[:-2]
        if part.endswith(b"\r\n"):
            part = part[:-2]
        if b"\r\n\r\n" not in part:
            continue
        header_blob, value = part.split(b"\r\n\r\n", 1)
        headers = header_blob.decode("latin-1")
        name = _field_name(headers)
        if name:
            fields[name] = value
    return fields


def _field_name(headers: str) -> str | None:
    for line in headers.splitlines():
        if not line.lower().startswith("content-disposition:"):
            continue
        for segment in line.split(";"):
            segment = segment.strip()
            if segment.startswith("name="):
                return segment.split("=", 1)[1].strip().strip('"')
    return None


def _png_data_url(payload: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(payload).decode("ascii")


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), CutoutStudioHandler)
    print(f"Cutout Studio backend running at http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
