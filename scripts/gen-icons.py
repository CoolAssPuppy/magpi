#!/usr/bin/env python3
"""Draws the Magpi mark at every size the product needs.

One geometry, rendered wherever a raster is required: the same folded magpie
as the homepage hero, in the same orientation. Written as a generator rather
than committed binaries, because an icon nobody can regenerate is an icon that
drifts from the mark on every other surface.

The planes match web/app/icon.svg and components/magpie-mark.tsx exactly.

    python3 scripts/gen-icons.py
"""

import pathlib
import struct
import zlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

INK_950 = (8, 9, 11)
INK_900 = (15, 17, 20)
INK_800 = (21, 24, 28)
INK_700 = (34, 38, 43)
INK_600 = (51, 56, 63)
INK_500 = (74, 80, 88)
INK_200 = (198, 201, 206)
INK_100 = (226, 228, 231)
CHALK_200 = (247, 246, 242)
CHALK_50 = (255, 255, 255)
SHEEN_500 = (15, 191, 168)
SHEEN_400 = (46, 211, 188)

# Painter's order, back to front, in the hero's own 660 by 460 space.
PLANES = [
    (((198, 214), (286, 402), (372, 224)), INK_600),
    (((286, 402), (372, 224), (344, 262)), INK_800),
    (((356, 232), (648, 322), (604, 372)), INK_500),
    (((356, 232), (604, 372), (372, 292)), INK_700),
    (((596, 316), (648, 322), (604, 372)), SHEEN_500),
    (((46, 190), (206, 128), (392, 236), (196, 232)), CHALK_200),
    (((46, 190), (196, 232), (214, 268)), INK_200),
    (((196, 232), (392, 236), (268, 292)), INK_100),
    (((206, 128), (318, 12), (400, 210)), CHALK_50),
    (((318, 12), (400, 210), (352, 116)), INK_200),
    (((382, 162), (400, 210), (352, 116)), SHEEN_500),
    (((46, 190), (142, 148), (138, 206)), INK_900),
    (((46, 190), (138, 206), (106, 214)), INK_700),
    (((14, 196), (46, 190), (44, 202)), SHEEN_400),
]

# The bird's own bounds inside that space, and the padding around it.
BIRD = (8, 6, 656, 408)
CONTENT_FRACTION = 0.86

TARGETS = {
    "web/public/icon-32.png": 32,
    "web/public/icon-192.png": 192,
    "web/public/icon-512.png": 512,
    "web/public/apple-touch-icon.png": 180,
    "design/oauth-logo-120.png": 120,
}

# Samples per axis inside a pixel. Four means sixteen samples, enough to keep
# a thin beak from stair-stepping at 32 pixels.
SUPERSAMPLE = 4


def inside(polygon, x, y):
    """Even-odd crossing test. Handles the body quad as well as the triangles."""
    is_in = False
    count = len(polygon)
    for index in range(count):
        ax, ay = polygon[index]
        bx, by = polygon[(index + 1) % count]
        if (ay > y) != (by > y):
            crossing = ax + (y - ay) / (by - ay) * (bx - ax)
            if x < crossing:
                is_in = not is_in
    return is_in


def colour_at(x, y):
    """The frontmost plane covering this point, or the ground."""
    for polygon, colour in reversed(PLANES):
        if inside(polygon, x, y):
            return colour
    return INK_950


def to_bird_space(px, py, size):
    """A pixel of the square icon, in the hero's coordinates."""
    left, top, width, height = BIRD
    content = size * CONTENT_FRACTION
    scale = content / width
    drawn_height = height * scale
    offset_x = (size - content) / 2
    offset_y = (size - drawn_height) / 2
    return (px - offset_x) / scale + left, (py - offset_y) / scale + top


def sample(px, py, size):
    """Average the samples in one pixel, so an edge lands between values."""
    total = [0, 0, 0]
    step = 1.0 / SUPERSAMPLE
    for sy in range(SUPERSAMPLE):
        for sx in range(SUPERSAMPLE):
            x, y = to_bird_space(px + (sx + 0.5) * step, py + (sy + 0.5) * step, size)
            colour = colour_at(x, y)
            for channel in range(3):
                total[channel] += colour[channel]
    count = SUPERSAMPLE * SUPERSAMPLE
    return bytes(value // count for value in total)


def render(size):
    return [b"".join(sample(px, py, size) for px in range(size)) for py in range(size)]


def chunk(tag, payload):
    body = tag + payload
    return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body))


def encode_png(rows, size):
    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    raw = b"".join(b"\x00" + row for row in rows)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def main():
    for relative, size in TARGETS.items():
        path = ROOT / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(encode_png(render(size), size))
        print("wrote %s at %dpx" % (relative, size))


if __name__ == "__main__":
    main()
