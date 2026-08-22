# Deploy state across your projects.
#
# The worst state among them sets the top band, because that is the one thing
# worth knowing from across a desk.

from sb import ui

SLUG = "deploys"
NAME = "DEPLOYS"

# Worst first. The band takes the first state present in this order.
_SEVERITY = ("ERROR", "BUILDING", "QUEUED", "CANCELED", "READY")

_MAX_ROWS = 4
_BAND_Y = ui.STATUS_H
_BAND_H = 44
_ROW_Y = _BAND_Y + _BAND_H + 10
_ROW_H = 34
_EXPANDED_H = 46
_BAND_CELL = 3
_PULSE_PERIOD_MS = 2000


def draw(ctx):
    if ctx.state == "not_connected":
        _message(ctx, "Not connected", "Add a Vercel token at magpi.app")
        return
    if ctx.state == "error":
        _message(ctx, "Vercel error", (ctx.data or {}).get("message"))
        return

    projects = _projects(ctx.data)
    if not projects:
        _message(ctx, "No projects", "Nothing to watch yet")
        return

    worst = _worst_state(projects)
    _draw_band(ctx, worst, projects)
    _draw_rows(ctx, projects, _expanded_index(ctx.data, len(projects)))


def leds(data, now_ms):
    """Full on an error, a slow pulse while building, off when everything is ready."""
    worst = _worst_state(_projects(data))
    if worst == "ERROR":
        return (1.0, 1.0, 1.0, 1.0)
    if worst == "BUILDING":
        level = 0.4 if (now_ms // (_PULSE_PERIOD_MS // 2)) % 2 == 0 else 0.0
        return (level,) * 4
    return (0.0, 0.0, 0.0, 0.0)


def on_a(machine, now_ms):
    """Cycle which project is expanded."""
    machine.cycle_selection(now_ms)


def _projects(data):
    projects = (data or {}).get("projects")
    return [p for p in projects if isinstance(p, dict)] if isinstance(projects, list) else []


def _worst_state(projects):
    states = {str(p.get("state") or "").upper() for p in projects}
    for state in _SEVERITY:
        if state in states:
            return state
    return "READY"


def _expanded_index(data, count):
    if count == 0:
        return None
    try:
        return int((data or {}).get("expanded", 0)) % count
    except (TypeError, ValueError):
        return 0


def _pen_for(palette, state):
    if state == "ERROR":
        return palette.bad
    if state in ("BUILDING", "QUEUED"):
        return palette.warn
    if state == "CANCELED":
        return palette.dim
    return palette.accent


def _draw_band(ctx, worst, projects):
    ctx.screen.pen = _pen_for(ctx.palette, worst)
    ui.fill(ctx.screen, ctx.shape, 0, _BAND_Y, ui.WIDTH, _BAND_H)

    ctx.screen.pen = ctx.palette.ink
    ui.block_text(ctx.screen, ctx.shape, worst, ui.MARGIN, _BAND_Y + 12, _BAND_CELL)

    matching = sum(1 for p in projects if str(p.get("state") or "").upper() == worst)
    count = "%d OF %d" % (matching, len(projects))
    width, _ = ctx.screen.measure_text(count, 11)
    ctx.screen.text(count, ui.WIDTH - ui.MARGIN - width, _BAND_Y + 17, 11)


def _draw_rows(ctx, projects, expanded):
    y = _ROW_Y
    for index, project in enumerate(projects[:_MAX_ROWS]):
        is_expanded = index == expanded
        height = _EXPANDED_H if is_expanded else _ROW_H
        if y + height > ui.HEIGHT:
            return
        _draw_row(ctx, project, y, height, is_expanded)
        y += height


def _draw_row(ctx, project, y, height, is_expanded):
    state = str(project.get("state") or "").upper()
    if is_expanded:
        ctx.screen.pen = ctx.palette.panel
        ui.fill(ctx.screen, ctx.shape, 0, y, ui.WIDTH, height)

    ctx.screen.pen = _pen_for(ctx.palette, state)
    ui.fill(ctx.screen, ctx.shape, 0, y, 3, height)

    ctx.screen.pen = ctx.palette.fg
    ctx.screen.text(str(project.get("name") or ""), ui.MARGIN, y + 4, 16)

    label = "%s %s" % (state[:5], _age_label(project.get("age_ms")))
    width, _ = ctx.screen.measure_text(label, 11)
    ctx.screen.pen = _pen_for(ctx.palette, state)
    ctx.screen.text(label, ui.WIDTH - ui.MARGIN - width, y + 8, 11)

    if is_expanded and project.get("commit"):
        ctx.screen.pen = ctx.palette.dim
        ctx.screen.text(str(project["commit"]), ui.MARGIN, y + 26, 11)


def _age_label(age_ms):
    try:
        seconds = int(age_ms) // 1000
    except (TypeError, ValueError):
        return ""
    if seconds < 60:
        return "%ds" % seconds
    if seconds < 3600:
        return "%dm" % (seconds // 60)
    if seconds < 86400:
        return "%dh" % (seconds // 3600)
    return "%dd" % (seconds // 86400)


def _message(ctx, heading, detail):
    ctx.screen.pen = ctx.palette.fg
    ui.block_text(ctx.screen, ctx.shape, heading.upper(), ui.MARGIN, 80, _BAND_CELL)
    if detail:
        ctx.screen.pen = ctx.palette.dim
        ctx.screen.text(detail, ui.MARGIN, 120, 12)
