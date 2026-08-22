# The Notifier view. Reads machine state, draws it, decides nothing.
#
# Page dispatch happens here: the machine knows which slug is current, the
# registry knows which module draws it, and neither knows about the other.

from sb import ui

import pages

_HEADING_CELL = 3
_BODY_Y = 120


class NotifierScreen:
    def __init__(self, screen, shape, color):
        self.screen = screen
        self.shape = shape
        self.palette = ui.Palette(color)

    def draw(self, machine):
        now_ms = getattr(machine, "now_ms", 0)
        self.screen.pen = self.palette.bg
        ui.fill(self.screen, self.shape, 0, 0, ui.WIDTH, ui.HEIGHT)

        if machine.state in ("waiting", "loading") and machine.payload is None:
            self._lifecycle(machine, "Joining WiFi", "This takes about 20 seconds")
            return
        if machine.state == "offline":
            self._lifecycle(machine, "No network", "B retries now")
            return

        page = machine.current_page
        if page is None:
            self._lifecycle(machine, "No pages yet", "Open magpi.app to choose pages")
            return

        module = pages.get(page.get("slug"))
        if module is None:
            # The machine filters unknown slugs out, so reaching here means the
            # registry and the filter disagree. Say so rather than drawing black.
            self._lifecycle(machine, "Unknown page", page.get("slug"))
            return

        self._status(machine, module)
        module.draw(
            pages.Ctx(
                screen=self.screen,
                shape=self.shape,
                palette=self.palette,
                data=_with_view_state(page, machine),
                state=page.get("state") or "ok",
                age_ms=page.get("age_ms"),
                now_ms=now_ms,
            )
        )

    def _status(self, machine, module):
        ui.status_bar(
            self.screen,
            self.shape,
            self.palette,
            left=getattr(module, "NAME", ""),
            middle=machine.clock or "",
            right=_right_slot(machine),
            accent=self.palette.warn if machine.state == "stale" else None,
        )

    def _lifecycle(self, machine, heading, detail):
        ui.status_bar(
            self.screen, self.shape, self.palette, left="MAGPI", middle=machine.clock or ""
        )
        self.screen.pen = self.palette.fg
        ui.block_text(self.screen, self.shape, heading.upper(), ui.MARGIN, 70, _HEADING_CELL)
        if detail:
            self.screen.pen = self.palette.dim
            self.screen.text(str(detail), ui.MARGIN, _BODY_Y, 12)
        if machine.message and machine.message != heading:
            self.screen.pen = self.palette.dim
            self.screen.text(str(machine.message), ui.MARGIN, _BODY_Y + 20, 11)


def _with_view_state(page, machine):
    """The page's data plus which item A has selected or expanded.

    Merged here rather than held in the payload, because it is a glance the
    wearer chose and the server has no business knowing it.
    """
    data = dict(page.get("data") or {})
    data.update(machine.page_view_state(page.get("slug")))
    return data


def _right_slot(machine):
    """Battery and data age, the two things that explain a stale screen."""
    parts = []
    age = machine.age_ms(getattr(machine, "now_ms", 0))
    if age is not None:
        parts.append(_age_label(age))
    if machine.power_label:
        parts.append(machine.power_label)
    return " - ".join(parts)


def _age_label(age_ms):
    seconds = age_ms // 1000
    if seconds < 60:
        return "%ds" % seconds
    if seconds < 3600:
        return "%dm" % (seconds // 60)
    return "%dh" % (seconds // 3600)
