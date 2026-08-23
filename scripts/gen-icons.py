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

# The badge launcher draws its own tile: a coloured squircle per app, with the
# icon blitted on top into rect(x, y, icon.width, 24). Two things follow, and
# both were wrong before a badge was ever plugged in.
#
# The height in that rect is the literal 24, and the width is whatever the file
# is. A 96 pixel icon was drawn 96 wide and 24 tall: the bird squashed to a
# quarter of its height and spilling across the neighbouring tiles.
#
# And the icon sits on the coloured squircle, so it needs a transparent ground.
# An opaque one covers the tile with a black square. Every icon Pimoroni ships
# is 24 square, 8-bit RGBA, with the background clear.
BADGE_ICON = 24
# The bird spans this much of the badge square. Wider than the web fraction
# because the launcher already pads the icon inside its tile, and 24 pixels has
# none to spare.
BADGE_FRACTION = 0.98

TARGETS = {
    # The launcher lists every folder under /system/apps holding an
    # __init__.py, and names the tile from the folder. icon.png is what stops
    # it drawing the default grey square instead.
    "device/notifier-app/icon.png": (BADGE_ICON, BADGE_FRACTION, None),
    "device/pomodoro-app/icon.png": (BADGE_ICON, BADGE_FRACTION, None),
    "web/public/icon-32.png": (32, CONTENT_FRACTION, INK_950),
    "web/public/icon-192.png": (192, CONTENT_FRACTION, INK_950),
    "web/public/icon-512.png": (512, CONTENT_FRACTION, INK_950),
    "web/public/apple-touch-icon.png": (180, CONTENT_FRACTION, INK_950),
    "design/oauth-logo-120.png": (120, CONTENT_FRACTION, INK_950),
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
    """The frontmost plane covering this point, or None off the bird."""
    for polygon, colour in reversed(PLANES):
        if inside(polygon, x, y):
            return colour
    return None


def to_bird_space(px, py, size, fraction=CONTENT_FRACTION):
    """A pixel of the square icon, in the hero's coordinates."""
    left, top, width, height = BIRD
    content = size * fraction
    scale = content / width
    drawn_height = height * scale
    offset_x = (size - content) / 2
    offset_y = (size - drawn_height) / 2
    return (px - offset_x) / scale + left, (py - offset_y) / scale + top


def sample(px, py, size, fraction=CONTENT_FRACTION, background=INK_950):
    """Average the samples in one pixel, so an edge lands between values.

    Returns straight RGBA. With a background the pixel is opaque and a miss
    takes the ground colour. Without one a miss is clear, and the colour is
    averaged over the hits alone: premultiplying here would darken every edge
    pixel towards black once the badge composites it over its coloured tile.
    """
    total = [0, 0, 0]
    hits = 0
    step = 1.0 / SUPERSAMPLE
    for sy in range(SUPERSAMPLE):
        for sx in range(SUPERSAMPLE):
            x, y = to_bird_space(px + (sx + 0.5) * step, py + (sy + 0.5) * step, size, fraction)
            colour = colour_at(x, y)
            if colour is None:
                if background is None:
                    continue
                colour = background
            else:
                hits += 1
            for channel in range(3):
                total[channel] += colour[channel]

    count = SUPERSAMPLE * SUPERSAMPLE
    if background is not None:
        return bytes([value // count for value in total] + [255])
    if hits == 0:
        return b"\x00\x00\x00\x00"
    return bytes([value // hits for value in total] + [hits * 255 // count])


def render(size, fraction=CONTENT_FRACTION, background=INK_950):
    return [
        b"".join(sample(px, py, size, fraction, background) for px in range(size))
        for py in range(size)
    ]


def chunk(tag, payload):
    body = tag + payload
    return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body))


def encode_png(rows, size):
    # Colour type 6: 8-bit RGBA. The badge icons need the alpha channel, and an
    # opaque one costs the web icons a byte a pixel before compression.
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    raw = b"".join(b"\x00" + row for row in rows)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def write(path, size, fraction=CONTENT_FRACTION, background=INK_950):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encode_png(render(size, fraction, background), size))
    ground = "on ink" if background is not None else "on clear"
    print("wrote %s at %dpx %s" % (path, size, ground))


def main(argv):
    """No arguments writes every icon the repo needs.

    --size and --out render one somewhere else, which is how the square a
    third party asks for gets made without adding it to the repo. Slack, for
    one, wants a square between 512 and 2000 pixels.

    --fill is how much of that square the bird spans. The mark is wide, so a
    square always leaves room above and below; somewhere small like a Slack
    sidebar wants that room kept to a minimum.

    --ground is "ink" or "clear". Clear is what anything drawing its own tile
    behind the mark wants, the badge launcher included.
    """
    args = dict(zip(argv[::2], argv[1::2]))
    if "--out" in args:
        size = int(args.get("--size", 1024))
        fraction = float(args.get("--fill", CONTENT_FRACTION))
        background = None if args.get("--ground") == "clear" else INK_950
        write(pathlib.Path(args["--out"]).expanduser(), size, fraction, background)
        return

    for relative, (size, fraction, background) in TARGETS.items():
        write(ROOT / relative, size, fraction, background)


if __name__ == "__main__":
    import sys

    main(sys.argv[1:])
