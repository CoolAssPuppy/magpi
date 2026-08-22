# One number, as large as it will go, with thirty points beneath it.
#
# One number per screen is the discipline that makes a small display useful.

from sb import ui
from sb.constants import SPARK_POINTS

SLUG = "one_number"
NAME = "NUMBER"

_LABEL_Y = 28
_VALUE_Y = 48
_VALUE_CELL = 9
_SPARK_Y = 132
_SPARK_H = 58
_FOOTER_Y = 206
_BAR_W = 9
_BAR_GAP = 1
_HEADING_CELL = 3


def draw(ctx):
    if ctx.state == "not_connected":
        _message(ctx, "Not connected", "Add a PostHog key at magpi.app")
        return
    if ctx.state == "error":
        _message(ctx, "Source error", (ctx.data or {}).get("message"))
        return

    number = ctx.data or {}
    if number.get("value") is None:
        _message(ctx, "No number yet", "Pick an insight at magpi.app")
        return

    _draw_label(ctx, number)
    _draw_value(ctx, number)
    _draw_spark(ctx, number)
    _draw_footer(ctx, number)


def _draw_label(ctx, number):
    ctx.screen.pen = ctx.palette.dim
    ctx.screen.text(str(number.get("label") or "").upper(), ui.MARGIN, _LABEL_Y, 11)

    delta = number.get("delta_pct")
    if delta is None:
        return
    try:
        text = "%+.1f%%" % float(delta)
    except (TypeError, ValueError):
        return
    width, _ = ctx.screen.measure_text(text, 11)
    ctx.screen.pen = ctx.palette.accent if float(delta) >= 0 else ctx.palette.bad
    ctx.screen.text(text, ui.WIDTH - ui.MARGIN - width, _LABEL_Y, 11)


def _draw_value(ctx, number):
    text = _format_value(number.get("value"), number.get("unit"))
    # Shrink the cell until the number fits rather than letting it run off the
    # right edge. A value that grew a digit overnight must still be readable.
    cell = _VALUE_CELL
    while cell > 3 and _block_width(text, cell) > ui.WIDTH - ui.MARGIN * 2:
        cell -= 1
    ctx.screen.pen = ctx.palette.fg
    ui.block_text(ctx.screen, ctx.shape, text, ui.MARGIN, _VALUE_Y, cell)


def _draw_spark(ctx, number):
    points = _clean_points(number.get("spark"))
    if not points:
        return

    low = min(points)
    high = max(points)
    span = high - low
    total = len(points)
    start_x = ui.WIDTH - ui.MARGIN - total * (_BAR_W + _BAR_GAP) + _BAR_GAP

    for index, point in enumerate(points):
        fraction = 1.0 if span == 0 else (point - low) / float(span)
        # int() truncates, which is what the web preview must also do.
        height = max(2, int(_SPARK_H * (0.25 + 0.75 * fraction)))
        x = start_x + index * (_BAR_W + _BAR_GAP)
        ctx.screen.pen = ctx.palette.accent if index == total - 1 else ctx.palette.dim
        ui.fill(ctx.screen, ctx.shape, x, _SPARK_Y + _SPARK_H - height, _BAR_W, height)


def _draw_footer(ctx, number):
    ctx.screen.pen = ctx.palette.dim
    if number.get("source"):
        ctx.screen.text(str(number["source"]).upper(), ui.MARGIN, _FOOTER_Y, 11)
    if number.get("updated"):
        text = str(number["updated"]).upper()
        width, _ = ctx.screen.measure_text(text, 11)
        ctx.screen.text(text, ui.WIDTH - ui.MARGIN - width, _FOOTER_Y, 11)


def _format_value(value, unit):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    text = "%d" % int(number) if number == int(number) else "%.1f" % number
    return "%s%s" % (text, unit) if unit else text


def _block_width(text, cell):
    return len(text) * (ui.BLOCK_W + ui.BLOCK_TRACKING) * cell


def _clean_points(spark):
    if not isinstance(spark, list):
        return []
    points = []
    for value in spark[-SPARK_POINTS:]:
        try:
            points.append(float(value))
        except (TypeError, ValueError):
            continue
    return points


def _message(ctx, heading, detail):
    ctx.screen.pen = ctx.palette.fg
    ui.block_text(ctx.screen, ctx.shape, heading.upper(), ui.MARGIN, 80, _HEADING_CELL)
    if detail:
        ctx.screen.pen = ctx.palette.dim
        ctx.screen.text(detail, ui.MARGIN, 120, 12)
