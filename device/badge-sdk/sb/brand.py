# The Supabase mark, drawn with the badge's shape primitives.
#
# The badge exposes circle, arc, rectangle, rounded_rectangle and line
# (spec 18.1). There is no polygon, and the mark is two triangles, so each is
# filled by scanline: one thin rectangle per row of pixels. At the sizes this
# is used, tens of pixels tall, that is a few dozen rectangles a frame and
# costs nothing measurable next to the QR.
#
# Geometry is taken from the official 109 by 113 viewBox so the proportions
# match the mark everywhere else it appears, rather than being redrawn by
# eye. The two curves in the real path are straight at this scale; a 40 pixel
# tall bolt cannot express a 2 pixel bezier.

# Upper triangle: apex at the top, vertical right edge, hypotenuse down-left.
_UPPER = ((54.5, 2.0), (54.5, 72.3), (9.8, 72.3))
# Lower triangle: flat top edge, apex at the bottom.
_LOWER = ((54.0, 40.0), (99.2, 40.0), (62.0, 110.3))

_VIEW_W = 109.0
_VIEW_H = 113.0

# Brand green, and the darker tone that stands in for the lower triangle's
# gradient. Two flat fills read as the two-tone mark; a gradient would need
# per-pixel work the badge has no primitive for.
BRAND = (62, 207, 142)
BRAND_DARK = (36, 147, 97)


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


def bolt_size(height):
    """Width of the mark at a given height, so callers can lay it out."""
    return int(height * (_VIEW_W / _VIEW_H) + 0.5)


def draw_bolt(screen, shape, color, x, y, height):
    """Draws the mark with its top-left at (x, y), `height` pixels tall.

    Leaves screen.pen set to the darker tone; callers set their own pen
    afterwards, as they do after any drawing helper here.
    """
    scale = height / _VIEW_H
    screen.pen = color.rgb(*BRAND)
    _fill_triangle(screen, shape, _UPPER, x, y, scale)
    screen.pen = color.rgb(*BRAND_DARK)
    _fill_triangle(screen, shape, _LOWER, x, y, scale)
