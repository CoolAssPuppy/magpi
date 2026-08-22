# Up to four numbers in a grid, with one recent subject line beneath.
#
# The machine remembers the previous values, so a count that went up blinks the
# LEDs once rather than nagging.

from sb import ui
from sb.constants import COUNTER_MAX, SUBJECT_MAX

SLUG = "counters"
NAME = "COUNTS"

_GRID_Y = ui.STATUS_H
_CELL_W = ui.WIDTH // 2
_CELL_H = 81
_RECENT_H = 46
_RECENT_Y = ui.HEIGHT - _RECENT_H
_VALUE_CELL = 5
_BLINK_MS = 1200


def draw(ctx):
    if ctx.state == "not_connected":
        _message(ctx, "Not connected", "Connect an account at magpi.app")
        return
    if ctx.state == "error":
        _message(ctx, "Counter error", (ctx.data or {}).get("message"))
        return

    counters = _counters(ctx.data)
    if not counters:
        _message(ctx, "Nothing counted", "Pick a counter at magpi.app")
        return

    selected = _selected_index(ctx.data, len(counters))
    for index, counter in enumerate(counters):
        _draw_cell(ctx, counter, index, index == selected)
    _draw_recent(ctx, counters[selected])


def leds(data, now_ms):
    """One blink when a count went up. Nothing otherwise."""
    if not _has_risen(data):
        return (0.0, 0.0, 0.0, 0.0)
    since = _as_int((data or {}).get("changed_age_ms"), _BLINK_MS)
    if since >= _BLINK_MS:
        return (0.0, 0.0, 0.0, 0.0)
    return (1.0, 1.0, 1.0, 1.0)


def on_a(machine, now_ms):
    """Cycle which counter's recent line is shown."""
    machine.cycle_selection(now_ms)


def _counters(data):
    counters = (data or {}).get("counters")
    if not isinstance(counters, list):
        return []
    return [c for c in counters if isinstance(c, dict)][:COUNTER_MAX]


def _selected_index(data, count):
    if count == 0:
        return 0
    try:
        return int((data or {}).get("selected", 0)) % count
    except (TypeError, ValueError):
        return 0


def _has_risen(data):
    for counter in _counters(data):
        if _as_int(counter.get("delta"), 0) > 0:
            return True
    return False


def _draw_cell(ctx, counter, index, is_selected):
    x = (index % 2) * _CELL_W
    y = _GRID_Y + (index // 2) * _CELL_H

    if is_selected:
        ctx.screen.pen = ctx.palette.panel
        ui.fill(ctx.screen, ctx.shape, x, y, _CELL_W, _CELL_H)

    ctx.screen.pen = ctx.palette.line
    ui.fill(ctx.screen, ctx.shape, x, y + _CELL_H - 1, _CELL_W, 1)
    if index % 2 == 0:
        ui.fill(ctx.screen, ctx.shape, x + _CELL_W - 1, y, 1, _CELL_H)

    ctx.screen.pen = ctx.palette.accent if is_selected else ctx.palette.dim
    ctx.screen.text(str(counter.get("label") or "").upper(), x + ui.MARGIN, y + 10, 11)

    ctx.screen.pen = ctx.palette.fg
    end_x = ui.block_text(
        ctx.screen, ctx.shape, str(_as_int(counter.get("value"), 0)), x + ui.MARGIN, y + 30, _VALUE_CELL
    )

    delta = _as_int(counter.get("delta"), 0)
    if delta:
        ctx.screen.pen = ctx.palette.accent if delta > 0 else ctx.palette.dim
        ctx.screen.text("%+d" % delta, end_x + 8, y + 30 + ui.BLOCK_H * _VALUE_CELL - 12, 11)


def _draw_recent(ctx, counter):
    ctx.screen.pen = ctx.palette.line
    ui.fill(ctx.screen, ctx.shape, 0, _RECENT_Y, ui.WIDTH, 1)

    recent = str(counter.get("recent") or "")[:SUBJECT_MAX]
    if recent:
        ctx.screen.pen = ctx.palette.fg
        ctx.screen.text(recent, ui.MARGIN, _RECENT_Y + 16, 11)

    hint = "A: CYCLE"
    width, _ = ctx.screen.measure_text(hint, 11)
    ctx.screen.pen = ctx.palette.accent
    ctx.screen.text(hint, ui.WIDTH - ui.MARGIN - width, _RECENT_Y + 16, 11)


def _as_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _message(ctx, heading, detail):
    ctx.screen.pen = ctx.palette.fg
    ui.block_text(ctx.screen, ctx.shape, heading.upper(), ui.MARGIN, 80, 3)
    if detail:
        ctx.screen.pen = ctx.palette.dim
        ctx.screen.text(detail, ui.MARGIN, 120, 12)
