from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from .pipeline import TemplateSettings, analyze_template, build_template_pdf


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
            image_bytes, settings = self._read_template_request()
            if self.path == "/api/analyze":
                analysis = analyze_template(image_bytes, settings)
                self._send_json(analysis.to_json())
                return
            if self.path == "/api/export":
                pdf = build_template_pdf(image_bytes, settings)
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

    def _read_template_request(self) -> tuple[bytes, TemplateSettings]:
        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("multipart/form-data"):
            raise ValueError("Request must be multipart/form-data.")

        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        form = _parse_multipart(body, content_type)
        image_bytes = form.get("image")
        if not image_bytes:
            raise ValueError("An image file is required.")
        settings_payload = form.get("settings", b"{}").decode("utf-8")
        try:
            settings_data = json.loads(settings_payload)
        except json.JSONDecodeError as exc:
            raise ValueError("Settings must be valid JSON.") from exc
        return image_bytes, TemplateSettings.from_mapping(settings_data)

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
        part = raw_part.strip()
        if not part or part == b"--":
            continue
        if part.endswith(b"--"):
            part = part[:-2].strip()
        if b"\r\n\r\n" not in part:
            continue
        header_blob, value = part.split(b"\r\n\r\n", 1)
        headers = header_blob.decode("latin-1")
        name = _field_name(headers)
        if name:
            fields[name] = value.rstrip(b"\r\n")
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


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), CutoutStudioHandler)
    print(f"Cutout Studio backend running at http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
