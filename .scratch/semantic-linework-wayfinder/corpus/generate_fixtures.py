"""Generate the original, deterministic semantic-linework evaluation corpus."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parent
SOURCE_DIR = ROOT / "sources"
SCALE = 2


def _canvas(size: tuple[int, int], background: tuple[int, int, int, int]) -> Image.Image:
    return Image.new("RGBA", (size[0] * SCALE, size[1] * SCALE), background)


def _box(values: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    return tuple(value * SCALE for value in values)


def _points(values: list[tuple[int, int]]) -> list[tuple[int, int]]:
    return [(x * SCALE, y * SCALE) for x, y in values]


def _line(draw: ImageDraw.ImageDraw, values: list[tuple[int, int]], fill: tuple[int, ...], width: int) -> None:
    draw.line(_points(values), fill=fill, width=width * SCALE, joint="curve")


def _finish(image: Image.Image, size: tuple[int, int], *, rgb: bool = False) -> Image.Image:
    resized = image.resize(size, Image.Resampling.LANCZOS)
    return resized.convert("RGB") if rgb else resized


def _vertical_gradient(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    gradient = Image.new("RGBA", size, (0, 0, 0, 0))
    pixels = gradient.load()
    for y in range(size[1]):
        ratio = y / max(1, size[1] - 1)
        color = tuple(round(top[i] * (1 - ratio) + bottom[i] * ratio) for i in range(3)) + (255,)
        for x in range(size[0]):
            pixels[x, y] = color
    return gradient


def soft_shaded_render() -> Image.Image:
    size = (720, 960)
    image = _canvas(size, (246, 247, 244, 255))
    mask = Image.new("L", image.size, 0)
    md = ImageDraw.Draw(mask)
    md.ellipse(_box((218, 90, 502, 350)), fill=255)
    md.polygon(_points([(180, 318), (540, 318), (610, 690), (500, 760), (220, 760), (110, 690)]), fill=255)
    md.rounded_rectangle(_box((185, 690, 315, 900)), radius=38 * SCALE, fill=255)
    md.rounded_rectangle(_box((405, 690, 535, 900)), radius=38 * SCALE, fill=255)
    md.polygon(_points([(135, 350), (55, 520), (155, 555), (255, 395)]), fill=255)
    md.polygon(_points([(510, 380), (650, 470), (595, 560), (455, 435)]), fill=255)

    gradient = _vertical_gradient(image.size, (242, 178, 122), (92, 68, 117))
    gradient = gradient.filter(ImageFilter.GaussianBlur(radius=26 * SCALE))
    image.alpha_composite(Image.composite(gradient, Image.new("RGBA", image.size), mask))
    draw = ImageDraw.Draw(image)
    ink = (47, 38, 55, 255)
    draw.ellipse(_box((218, 90, 502, 350)), outline=ink, width=7 * SCALE)
    draw.pieslice(_box((195, 62, 525, 300)), 180, 360, fill=(72, 48, 83, 255), outline=ink, width=7 * SCALE)
    draw.polygon(_points([(230, 180), (180, 305), (270, 255), (315, 330), (355, 245), (420, 320), (500, 190)]), fill=(86, 56, 97, 255), outline=ink)
    draw.ellipse(_box((275, 200, 315, 240)), fill=(238, 238, 231, 255), outline=ink, width=5 * SCALE)
    draw.ellipse(_box((400, 200, 440, 240)), fill=(238, 238, 231, 255), outline=ink, width=5 * SCALE)
    draw.arc(_box((300, 235, 420, 315)), 20, 160, fill=ink, width=5 * SCALE)
    _line(draw, [(360, 320), (360, 680)], ink, 6)
    _line(draw, [(185, 470), (535, 470)], ink, 5)
    draw.rounded_rectangle(_box((500, 455, 620, 610)), radius=18 * SCALE, fill=(230, 181, 67, 255), outline=ink, width=6 * SCALE)
    _line(draw, [(535, 455), (560, 415), (585, 455)], ink, 5)
    draw.arc(_box((225, 320, 495, 720)), 205, 335, fill=(220, 180, 213, 255), width=16 * SCALE)
    draw.rounded_rectangle(_box((165, 835, 325, 920)), radius=25 * SCALE, fill=(54, 51, 72, 255), outline=ink, width=6 * SCALE)
    draw.rounded_rectangle(_box((395, 835, 555, 920)), radius=25 * SCALE, fill=(54, 51, 72, 255), outline=ink, width=6 * SCALE)
    return _finish(image, size)


def flat_outlined_jpeg() -> Image.Image:
    size = (720, 960)
    image = _canvas(size, (255, 255, 255, 255))
    draw = ImageDraw.Draw(image)
    ink = (17, 18, 20, 255)
    draw.ellipse(_box((220, 95, 500, 355)), fill=(245, 192, 139, 255), outline=ink, width=10 * SCALE)
    draw.pieslice(_box((190, 45, 530, 270)), 180, 360, fill=(50, 132, 158, 255), outline=ink, width=10 * SCALE)
    draw.rectangle(_box((205, 145, 515, 190)), fill=(50, 132, 158, 255), outline=ink, width=8 * SCALE)
    draw.polygon(_points([(190, 330), (530, 330), (570, 700), (150, 700)]), fill=(224, 103, 72, 255), outline=ink)
    _line(draw, [(190, 330), (530, 330), (570, 700), (150, 700), (190, 330)], ink, 10)
    draw.polygon(_points([(175, 370), (65, 535), (130, 585), (260, 430)]), fill=(245, 192, 139, 255), outline=ink)
    draw.polygon(_points([(545, 370), (655, 535), (590, 585), (460, 430)]), fill=(245, 192, 139, 255), outline=ink)
    draw.rounded_rectangle(_box((60, 525, 145, 605)), radius=24 * SCALE, fill=(245, 192, 139, 255), outline=ink, width=9 * SCALE)
    draw.rounded_rectangle(_box((575, 525, 660, 605)), radius=24 * SCALE, fill=(245, 192, 139, 255), outline=ink, width=9 * SCALE)
    draw.rounded_rectangle(_box((205, 680, 325, 870)), radius=30 * SCALE, fill=(60, 85, 139, 255), outline=ink, width=10 * SCALE)
    draw.rounded_rectangle(_box((395, 680, 515, 870)), radius=30 * SCALE, fill=(60, 85, 139, 255), outline=ink, width=10 * SCALE)
    draw.rounded_rectangle(_box((165, 830, 330, 920)), radius=26 * SCALE, fill=(88, 56, 42, 255), outline=ink, width=10 * SCALE)
    draw.rounded_rectangle(_box((390, 830, 555, 920)), radius=26 * SCALE, fill=(88, 56, 42, 255), outline=ink, width=10 * SCALE)
    draw.ellipse(_box((275, 195, 315, 235)), fill=(255, 255, 255, 255), outline=ink, width=6 * SCALE)
    draw.ellipse(_box((405, 195, 445, 235)), fill=(255, 255, 255, 255), outline=ink, width=6 * SCALE)
    draw.arc(_box((295, 225, 425, 315)), 15, 165, fill=ink, width=7 * SCALE)
    _line(draw, [(210, 420), (510, 420)], ink, 8)
    _line(draw, [(360, 335), (360, 700)], ink, 8)
    draw.rounded_rectangle(_box((405, 470, 565, 640)), radius=20 * SCALE, fill=(232, 186, 64, 255), outline=ink, width=9 * SCALE)
    _line(draw, [(250, 350), (485, 545)], ink, 9)
    return _finish(image, size, rgb=True)


def transparent_cartoon() -> Image.Image:
    size = (720, 960)
    image = _canvas(size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    ink = (22, 32, 43, 255)
    draw.ellipse(_box((230, 115, 490, 365)), fill=(250, 205, 166, 255), outline=ink, width=9 * SCALE)
    draw.polygon(_points([(205, 220), (245, 85), (360, 35), (475, 85), (515, 220), (435, 160), (365, 205), (290, 145)]), fill=(54, 103, 135, 255), outline=ink)
    draw.polygon(_points([(175, 345), (545, 345), (610, 700), (110, 700)]), fill=(242, 184, 61, 255), outline=ink)
    _line(draw, [(175, 345), (545, 345), (610, 700), (110, 700), (175, 345)], ink, 9)
    draw.polygon(_points([(185, 390), (55, 515), (115, 585), (260, 445)]), fill=(250, 205, 166, 255), outline=ink)
    draw.polygon(_points([(535, 390), (665, 515), (605, 585), (460, 445)]), fill=(250, 205, 166, 255), outline=ink)
    draw.rounded_rectangle(_box((175, 680, 315, 875)), radius=34 * SCALE, fill=(78, 119, 102, 255), outline=ink, width=9 * SCALE)
    draw.rounded_rectangle(_box((405, 680, 545, 875)), radius=34 * SCALE, fill=(78, 119, 102, 255), outline=ink, width=9 * SCALE)
    draw.rounded_rectangle(_box((145, 830, 325, 920)), radius=26 * SCALE, fill=(42, 67, 79, 255), outline=ink, width=9 * SCALE)
    draw.rounded_rectangle(_box((395, 830, 575, 920)), radius=26 * SCALE, fill=(42, 67, 79, 255), outline=ink, width=9 * SCALE)
    draw.ellipse(_box((275, 215, 315, 255)), fill=(255, 255, 255, 255), outline=ink, width=5 * SCALE)
    draw.ellipse(_box((405, 215, 445, 255)), fill=(255, 255, 255, 255), outline=ink, width=5 * SCALE)
    draw.arc(_box((300, 250, 420, 325)), 15, 165, fill=ink, width=6 * SCALE)
    _line(draw, [(360, 345), (360, 700)], ink, 7)
    draw.arc(_box((135, 390, 585, 755)), 205, 335, fill=(177, 73, 85, 255), width=18 * SCALE)
    draw.ellipse(_box((505, 470, 665, 630)), fill=(91, 158, 181, 255), outline=ink, width=8 * SCALE)
    _line(draw, [(585, 470), (585, 425)], ink, 6)
    return _finish(image, size)


def dark_complex_cartoon() -> Image.Image:
    size = (800, 960)
    image = _canvas(size, (250, 247, 239, 255))
    draw = ImageDraw.Draw(image)
    ink = (12, 14, 19, 255)
    draw.ellipse(_box((260, 115, 540, 390)), fill=(181, 125, 96, 255), outline=ink, width=9 * SCALE)
    draw.polygon(_points([(235, 225), (250, 90), (330, 35), (385, 110), (450, 35), (555, 120), (565, 250), (500, 180), (450, 245), (390, 160), (325, 250)]), fill=(35, 28, 43, 255), outline=ink)
    draw.polygon(_points([(210, 360), (590, 360), (690, 760), (110, 760)]), fill=(29, 42, 62, 255), outline=ink)
    _line(draw, [(210, 360), (590, 360), (690, 760), (110, 760), (210, 360)], ink, 10)
    draw.polygon(_points([(220, 405), (75, 505), (130, 600), (285, 470)]), fill=(181, 125, 96, 255), outline=ink)
    draw.polygon(_points([(580, 405), (725, 505), (670, 600), (515, 470)]), fill=(181, 125, 96, 255), outline=ink)
    for x, y in [(80, 515), (105, 500), (130, 500), (655, 500), (680, 500), (705, 515)]:
        draw.ellipse(_box((x, y, x + 45, y + 70)), fill=(181, 125, 96, 255), outline=ink, width=6 * SCALE)
    draw.rounded_rectangle(_box((205, 710, 345, 885)), radius=32 * SCALE, fill=(67, 64, 76, 255), outline=ink, width=9 * SCALE)
    draw.rounded_rectangle(_box((455, 710, 595, 885)), radius=32 * SCALE, fill=(67, 64, 76, 255), outline=ink, width=9 * SCALE)
    draw.rounded_rectangle(_box((160, 845, 355, 930)), radius=26 * SCALE, fill=(20, 23, 30, 255), outline=ink, width=9 * SCALE)
    draw.rounded_rectangle(_box((445, 845, 640, 930)), radius=26 * SCALE, fill=(20, 23, 30, 255), outline=ink, width=9 * SCALE)
    draw.ellipse(_box((310, 225, 350, 265)), fill=(250, 245, 225, 255), outline=ink, width=5 * SCALE)
    draw.ellipse(_box((450, 225, 490, 265)), fill=(250, 245, 225, 255), outline=ink, width=5 * SCALE)
    draw.arc(_box((330, 260, 470, 340)), 20, 160, fill=ink, width=6 * SCALE)
    _line(draw, [(400, 360), (400, 760)], (230, 190, 72, 255), 8)
    draw.arc(_box((170, 345, 630, 770)), 205, 335, fill=(230, 190, 72, 255), width=20 * SCALE)
    draw.rounded_rectangle(_box((500, 480, 680, 670)), radius=24 * SCALE, fill=(112, 58, 44, 255), outline=ink, width=9 * SCALE)
    draw.line(_points([(220, 360), (275, 385), (320, 365), (365, 390), (410, 365), (455, 390), (500, 365), (560, 390)]), fill=(236, 232, 219, 255), width=28 * SCALE, joint="curve")
    return _finish(image, size)


FIXTURES = [
    ("soft-shaded-render", "PNG", soft_shaded_render),
    ("flat-outlined-cartoon", "JPEG", flat_outlined_jpeg),
    ("transparent-cartoon", "PNG", transparent_cartoon),
    ("dark-complex-cartoon", "PNG", dark_complex_cartoon),
]


def main() -> None:
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    generated: list[dict[str, object]] = []
    for fixture_id, image_format, factory in FIXTURES:
        image = factory()
        suffix = ".jpg" if image_format == "JPEG" else ".png"
        target = SOURCE_DIR / f"{fixture_id}{suffix}"
        save_options = {"quality": 88, "subsampling": 0} if image_format == "JPEG" else {"optimize": False}
        image.save(target, format=image_format, **save_options)
        data = target.read_bytes()
        generated.append(
            {
                "id": fixture_id,
                "source": target.relative_to(ROOT).as_posix(),
                "format": image_format,
                "mode": image.mode,
                "width": image.width,
                "height": image.height,
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        )

    (ROOT / "generated-files.json").write_text(
        json.dumps({"generator": "generate_fixtures.py", "fixtures": generated}, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )


if __name__ == "__main__":
    main()
