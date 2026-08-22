# The Magpi mark, drawn with the badge's shape primitives.
#
# The badge exposes circle, arc, rectangle, rounded_rectangle and line. There
# is no polygon, and the mark is three triangles, so each is filled by
# scanline: one thin rectangle per row of pixels. At the sizes this is used,
# tens of pixels tall, that is a few dozen rectangles a frame and costs
# nothing measurable next to the QR.
#
# Geometry is taken from the 26 by 20 viewBox the mark is drawn in everywhere
# else, so the proportions match rather than being redrawn by eye.

# Origami magpie: a folded body, the far wing behind it, the long tail.
_BODY = ((0.0, 10.0), (11.0, 3.0), (11.0, 12.0))
_WING = ((11.0, 3.0), (26.0, 0.0), (11.0, 12.0))
_TAIL = ((11.0, 12.0), (26.0, 0.0), (22.0, 17.0))

_VIEW_W = 26.0
_VIEW_H = 20.0

# Three flat fills, one per fold. A gradient would need per-pixel work the
# badge has no primitive for.
CHALK = (247, 246, 242)
SHADE = (154, 160, 168)
SHEEN = (15, 191, 168)


def _fill_triangle(screen, shape, tri, ox, oy, scale):
    """Scanline-fills a triangle, one rectangle per row."""
    pts = [(ox + x * scale, oy + y * scale) for (x, y) in tri]
    top = min(p[1] for p in pts)
    bottom = max(p[1] for p in pts)

    y = int(top)
    end = int(bottom + 0.5)
    while y <= end:
        # Where each edge crosses this row. A triangle is convex, so the
        # span is simply the leftmost to the rightmost crossing.
        xs = []
        for i in range(3):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % 3]
            if y1 == y2:
                continue
            lo, hi = (y1, y2) if y1 < y2 else (y2, y1)
            if lo <= y <= hi:
                t = (y - y1) / (y2 - y1)
                xs.append(x1 + (x2 - x1) * t)
        if len(xs) >= 2:
            left = int(min(xs))
            width = int(max(xs) - min(xs) + 0.5)
            if width > 0:
                screen.shape(shape.rectangle(left, y, width, 1))
        y += 1


def mark_size(height):
    """Width of the mark at a given height, so callers can lay it out."""
    return int(height * (_VIEW_W / _VIEW_H) + 0.5)


def draw_mark(screen, shape, color, x, y, height):
    """Draws the mark with its top-left at (x, y), `height` pixels tall.

    Leaves screen.pen set to the tail's tone; callers set their own pen
    afterwards, as they do after any drawing helper here.
    """
    scale = height / _VIEW_H
    screen.pen = color.rgb(*CHALK)
    _fill_triangle(screen, shape, _BODY, x, y, scale)
    screen.pen = color.rgb(*SHADE)
    _fill_triangle(screen, shape, _WING, x, y, scale)
    screen.pen = color.rgb(*SHEEN)
    _fill_triangle(screen, shape, _TAIL, x, y, scale)
