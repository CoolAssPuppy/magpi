# The shape of the day: twenty-four hours as a band of cells.
#
# One cell per hour from DAY_START_HOUR, filled by how booked that hour is. No
# LEDs: this page is a shape you read, not an alert.

from sb import ui
from sb.constants import DAY_BLOCKS, DAY_START_HOUR

SLUG = "day_shape"
NAME = "DAY"

_CELL_W = 12
_GAP = 1
_BAND_W = DAY_BLOCKS * _CELL_W
_BAND_X = (ui.WIDTH - _BAND_W) // 2
_BAND_Y = 60
_BAND_H = 72
_MARKER_H = 4
_AXIS_Y = _BAND_Y + _BAND_H + _MARKER_H + 4
_SUMMARY_Y = 178
_HEADING_CELL = 3
_MAX_LEVEL = 3


def draw(ctx):
    if ctx.state == "not_connected":
        _message(ctx, "Not connected", "Connect Google at magpi.to")
        return
    if ctx.state == "error":
        _message(ctx, "Calendar error", (ctx.data or {}).get("message"))
        return

    day = ctx.data or {}
    blocks = _clean_blocks(day.get("blocks"))
    if not any(blocks):
        _heading(ctx, day)
        _draw_band(ctx, blocks, day.get("current_hour"))
        ctx.screen.pen = ctx.palette.dim
        ctx.screen.text("Nothing booked", ui.MARGIN, _SUMMARY_Y, 16)
        return

    _heading(ctx, day)
    _draw_band(ctx, blocks, day.get("current_hour"))
    _draw_axis(ctx)
    _draw_summary(ctx, day)


def on_a(machine, now_ms):
    """Toggle today and tomorrow."""
    machine.toggle_expanded(now_ms)


def _heading(ctx, day):
    ctx.screen.pen = ctx.palette.fg
    label = "TOMORROW" if day.get("is_tomorrow") else "TODAY"
    ui.block_text(ctx.screen, ctx.shape, label, ui.MARGIN, 26, _HEADING_CELL)

    hint = "A: TOMORROW" if not day.get("is_tomorrow") else "A: TODAY"
    width, _ = ctx.screen.measure_text(hint, 11)
    ctx.screen.pen = ctx.palette.accent
    ctx.screen.text(hint, ui.WIDTH - ui.MARGIN - width, 30, 11)


def _draw_band(ctx, blocks, current_hour):
    for index, level in enumerate(blocks):
        x = _BAND_X + index * _CELL_W
        height = _cell_height(level)
        ctx.screen.pen = ctx.palette.ramp[level]
        ui.fill(ctx.screen, ctx.shape, x, _BAND_Y + _BAND_H - height, _CELL_W - _GAP, height)

    marker = _marker_index(current_hour)
    if marker is not None:
        ctx.screen.pen = ctx.palette.accent
        ui.fill(
            ctx.screen,
            ctx.shape,
            _BAND_X + marker * _CELL_W,
            _BAND_Y + _BAND_H + 2,
            _CELL_W - _GAP,
            _MARKER_H,
        )


def _draw_axis(ctx):
    ctx.screen.pen = ctx.palette.dim
    for offset in (0, 5, 10, 15):
        hour = (DAY_START_HOUR + offset) % 24
        ctx.screen.text("%02d" % hour, _BAND_X + offset * _CELL_W, _AXIS_Y, 11)


def _draw_summary(ctx, day):
    meetings = _as_int(day.get("meeting_count"), 0)
    free = _as_int(day.get("free_minutes"), 0)
    label = "%d meeting%s" % (meetings, "" if meetings == 1 else "s")
    ctx.screen.pen = ctx.palette.fg
    width, _ = ctx.screen.measure_text(label, 16)
    ctx.screen.text(label, ui.MARGIN, _SUMMARY_Y, 16)
    ctx.screen.pen = ctx.palette.dim
    ctx.screen.text(_free_label(free), ui.MARGIN + width + 10, _SUMMARY_Y, 16)


def _free_label(minutes):
    hours = minutes // 60
    rest = minutes % 60
    if hours and rest:
        return "%dh %dm free" % (hours, rest)
    if hours:
        return "%dh free" % hours
    return "%dm free" % rest


def _cell_height(level):
    if level <= 0:
        return _BAND_H // 6
    return int(_BAND_H * (level / float(_MAX_LEVEL)))


def _clean_blocks(blocks):
    """Always DAY_BLOCKS cells. A short list draws as free rather than raising."""
    cleaned = []
    for index in range(DAY_BLOCKS):
        try:
            level = int(blocks[index])
        except (TypeError, ValueError, IndexError, KeyError):
            level = 0
        cleaned.append(min(_MAX_LEVEL, max(0, level)))
    return cleaned


def _marker_index(current_hour):
    hour = _as_int(current_hour, None)
    if hour is None:
        return None
    index = (hour - DAY_START_HOUR) % 24
    return index if 0 <= index < DAY_BLOCKS else None


def _as_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _message(ctx, heading, detail):
    ctx.screen.pen = ctx.palette.fg
    ui.block_text(ctx.screen, ctx.shape, heading.upper(), ui.MARGIN, 80, _HEADING_CELL)
    if detail:
        ctx.screen.pen = ctx.palette.dim
        ctx.screen.text(detail, ui.MARGIN, 120, 12)
