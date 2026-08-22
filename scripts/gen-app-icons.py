#!/usr/bin/env python3
"""Draws the launcher icon for each badge app.

The launcher lists every folder holding an icon.png and names the tile from
the folder, so these two files are what put Notifier and Pomodoro on the menu.

Written as a generator rather than two committed binaries: an icon nobody can
regenerate is an icon that drifts from the mark on every other surface. The
geometry is the same three folded planes as sb/brand.py and the web mark, in
the same 26 by 20 viewBox.

    python3 scripts/gen-app-icons.py
"""

import pathlib
import struct
import zlib

SIZE = 96
ROOT = pathlib.Path(__file__).resolve().parent.parent

# The magpie, from docs/DESIGN.md. Same values as sb/brand.py.
INK = (8, 9, 11)
CHALK = (247, 246, 242)
SHADE = (154, 160, 168)
SHEEN = (15, 191, 168)
VIOLET = (122, 92, 255)

VIEW_W, VIEW_H = 26.0, 20.0

BODY = ((0.0, 10.0), (11.0, 3.0), (11.0, 12.0))
WING = ((11.0, 3.0), (26.0, 0.0), (11.0, 12.0))
TAIL = ((11.0, 12.0), (26.0, 0.0), (22.0, 17.0))


def inside(triangle, x, y):
    """Half-plane test, consistent winding, so a shared edge draws once."""
    signs = []
    for index in range(3):
        ax, ay = triangle[index]
        bx, by = triangle[(index + 1) % 3]
        signs.append((bx - ax) * (y - ay) - (by - ay) * (x - ax))
    return all(s >= 0 for s in signs) or all(s <= 0 for s in signs)


def render(accent):
    """One RGB row per scanline, the bird centred in a square of ink."""
    scale = SIZE / VIEW_W
    height = VIEW_H * scale
    top = (SIZE - height) / 2.0
    rows = []
    for py in range(SIZE):
        row = bytearray()
        for px in range(SIZE):
            x = (px + 0.5) / scale
            y = (py + 0.5 - top) / scale
            if inside(TAIL, x, y):
                row += bytes(accent)
            elif inside(WING, x, y):
                row += bytes(SHADE)
            elif inside(BODY, x, y):
                row += bytes(CHALK)
            else:
                row += bytes(INK)
        rows.append(bytes(row))
    return rows


def chunk(tag, payload):
    body = tag + payload
    return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body))


def encode_png(rows):
    header = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 2, 0, 0, 0)
    # Filter type 0 on every row. The images are tiny and a smarter filter
    # would make the output depend on the zlib version.
    raw = b"".join(b"\x00" + row for row in rows)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def main():
    targets = {
        # Notifier wears the sheen, Pomodoro the violet, so the two tiles are
        # told apart at a glance on the launcher.
        ROOT / "device/notifier-app/icon.png": SHEEN,
        ROOT / "device/pomodoro-app/icon.png": VIOLET,
    }
    for path, accent in targets.items():
        path.write_bytes(encode_png(render(accent)))
        print("wrote %s" % path.relative_to(ROOT))


if __name__ == "__main__":
    main()
