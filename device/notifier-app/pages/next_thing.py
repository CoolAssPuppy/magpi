# What is next in the calendar.
#
# Minutes until fills the upper half, because that is the number you read from
# across a desk. Everything else is support.

from sb import ui

SLUG = "next_thing"
NAME = "NEXT"

# The LED ramp, closest threshold first, so five minutes takes the brighter
# level rather than the first one that happens to match. Off above the last
# threshold, a pulse inside the final minute, off once the meeting started.
_RAMP = ((5, 0.5), (15, 0.25))
_PULSE_PERIOD_MS = 1000

# block_text draws a 7-row glyph grid, so a cell of N is 7N pixels tall.
_MINUTES_CELL = 10
_HEADING_CELL = 4
_MINUTES_Y = 26
_TITLE_Y = 112
_TITLE_LINE_H = 20
_META_Y = 160
_LINES = 2


def draw(ctx):
    if ctx.state == "not_connected":
        _message(ctx, "Not connected", "Connect Google at magpi.to")
        return
    if ctx.state == "error":
        _message(ctx, "Calendar error", ctx.data.get("message") or "Google did not answer")
        return

    event = ctx.data or {}
    if not event.get("title"):
        _message(ctx, "Nothing until tomorrow", None)
        return

    _draw_minutes(ctx, event)
    _draw_title(ctx, event)
    _draw_meta(ctx, event)


def leds(data, now_ms):
    """Four levels, ramping with proximity. Off once the meeting has started."""
    minutes = _minutes_until(data)
    if minutes is None or minutes < 0:
        return (0.0, 0.0, 0.0, 0.0)
    if minutes < 1:
        # A square pulse rather than a fade. Nothing here lands between two
        # states, and a fading LED on a desk reads as a fault.
        level = 1.0 if (now_ms // (_PULSE_PERIOD_MS // 2)) % 2 == 0 else 0.0
        return (level,) * 4
    for threshold, level in _RAMP:
        if minutes <= threshold:
            return (level,) * 4
    return (0.0, 0.0, 0.0, 0.0)


def on_a(machine, now_ms):
    """Toggle between the next thing and the next three."""
    machine.toggle_expanded(now_ms)


def _minutes_until(data):
    try:
        return int((data or {}).get("minutes_until"))
    except (TypeError, ValueError):
        return None


def _draw_minutes(ctx, event):
    minutes = _minutes_until(event)
    if minutes is None:
        return
    if event.get("all_day"):
        ctx.screen.pen = ctx.palette.fg
        ui.block_text(ctx.screen, ctx.shape, "ALL DAY", ui.MARGIN, _MINUTES_Y, _HEADING_CELL)
        return

    label = "NOW" if minutes <= 0 else str(minutes)
    ctx.screen.pen = ctx.palette.fg
    end_x = ui.block_text(ctx.screen, ctx.shape, label, ui.MARGIN, _MINUTES_Y, _MINUTES_CELL)
    if minutes > 0:
        ctx.screen.pen = ctx.palette.accent
        baseline = _MINUTES_Y + ui.BLOCK_H * _MINUTES_CELL - 16
        ctx.screen.text("MIN", end_x + 10, baseline, 16)


def _draw_title(ctx, event):
    ctx.screen.pen = ctx.palette.fg
    for index, line in enumerate(_wrap(ctx, event.get("title") or "", 16)):
        ctx.screen.text(line, ui.MARGIN, _TITLE_Y + index * _TITLE_LINE_H, 16)


def _draw_meta(ctx, event):
    parts = []
    if event.get("start"):
        parts.append(event["start"])
        if event.get("end"):
            parts[-1] = "%s - %s" % (event["start"], event["end"])
    if event.get("location"):
        parts.append(event["location"])
    if event.get("conferencing"):
        parts.append(event["conferencing"])

    if parts:
        ctx.screen.pen = ctx.palette.dim
        ctx.screen.text(" - ".join(parts), ui.MARGIN, _META_Y, 11)

    if event.get("more"):
        hint = "A: NEXT %d" % len(event["more"])
        width, _ = ctx.screen.measure_text(hint, 11)
        ctx.screen.pen = ctx.palette.accent
        ctx.screen.text(hint, ui.WIDTH - ui.MARGIN - width, _META_Y, 11)


def _wrap(ctx, text, size):
    """Break on spaces to at most two lines, measuring as the screen will."""
    limit = ui.WIDTH - ui.MARGIN * 2
    lines = []
    current = ""
    for word in text.split(" "):
        candidate = "%s %s" % (current, word) if current else word
        width, _ = ctx.screen.measure_text(candidate, size)
        if width <= limit:
            current = candidate
            continue
        if current:
            lines.append(current)
        current = word
        if len(lines) == _LINES:
            return lines
    if current and len(lines) < _LINES:
        lines.append(current)
    return lines[:_LINES]


def _message(ctx, heading, detail):
    ctx.screen.pen = ctx.palette.fg
    ui.block_text(ctx.screen, ctx.shape, heading.upper(), ui.MARGIN, _MINUTES_Y + 20, _HEADING_CELL)
    if detail:
        ctx.screen.pen = ctx.palette.dim
        ctx.screen.text(detail, ui.MARGIN, _TITLE_Y + 10, 12)
