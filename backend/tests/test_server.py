import unittest

from backend.cutout_studio.server import _parse_multipart


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


if __name__ == "__main__":
    unittest.main()
