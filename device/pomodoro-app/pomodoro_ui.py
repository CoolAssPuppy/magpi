# The Pomodoro view. Reads machine state, draws it, decides nothing.

from sb import ui

from pomodoro import (
    STATE_ABANDON_CONFIRM,
    STATE_IDLE,
    STATE_LONG_BREAK,
    STATE_SET_DONE,
    STATE_SHORT_BREAK,
    STATE_WORK,
)

# The clock, as large as the glyph grid will draw it across 320 pixels. Five
# characters at a cell of 9 is 264 wide, which leaves a margin either side.
_CLOCK_CELL = 9
_CLOCK_Y = 62
_PHASE_Y = 26
_DOT_R = 8
_DOT_GAP = 14
_DOTS_Y = 168
_HINT_Y = 208


class PomodoroScreen:
    def __init__(self, screen, shape, color):
        self.screen = screen
        self.shape = shape
        self.palette = ui.Palette(color)

    def draw(self, machine):
        self.screen.pen = self.palette.bg
        ui.fill(self.screen, self.shape, 0, 0, ui.WIDTH, ui.HEIGHT)

        self._header(machine)
        if machine.state == STATE_ABANDON_CONFIRM:
            self._abandon(machine)
            return

        self._clock(machine)
        self._dots(machine)
        self._hint(machine)

    def _header(self, machine):
        self.screen.pen = self._accent_for(machine.state)
        self.screen.text(machine.phase_label, ui.MARGIN, _PHASE_Y, 16)

        tally = "TODAY %d" % machine.completed_today
        width, _ = self.screen.measure_text(tally, 11)
        self.screen.pen = self.palette.dim
        self.screen.text(tally, ui.WIDTH - ui.MARGIN - width, _PHASE_Y + 4, 11)

    def _clock(self, machine):
        text = machine.clock_text
        width = ui.block_width(text, _CLOCK_CELL)
        self.screen.pen = self.palette.fg
        ui.block_text(
            self.screen, self.shape, text, (ui.WIDTH - width) // 2, _CLOCK_Y, _CLOCK_CELL
        )

    def _dots(self, machine):
        dots = machine.set_dots
        span = len(dots) * (_DOT_R * 2) + (len(dots) - 1) * _DOT_GAP
        x = (ui.WIDTH - span) // 2 + _DOT_R

        for dot in dots:
            if dot == 1:
                self.screen.pen = self.palette.fg
                self.screen.shape(self.shape.circle(x, _DOTS_Y, _DOT_R))
            elif dot == 2:
                # The one running: an outline, so a finished pomodoro and the
                # current one never read the same from across a desk.
                self.screen.pen = self._accent_for(machine.state)
                self.screen.shape(self.shape.circle(x, _DOTS_Y, _DOT_R))
                self.screen.pen = self.palette.bg
                self.screen.shape(self.shape.circle(x, _DOTS_Y, _DOT_R - 2))
            else:
                self.screen.pen = self.palette.line
                self.screen.shape(self.shape.circle(x, _DOTS_Y, _DOT_R))
                self.screen.pen = self.palette.bg
                self.screen.shape(self.shape.circle(x, _DOTS_Y, _DOT_R - 2))
            x += _DOT_R * 2 + _DOT_GAP

    def _hint(self, machine):
        hint = _HINTS.get(machine.state)
        if machine.state in (STATE_SHORT_BREAK, STATE_LONG_BREAK) and machine.remaining_ms == 0:
            hint = "A STARTS THE NEXT POMODORO"
        if not hint:
            return
        width, _ = self.screen.measure_text(hint, 11)
        self.screen.pen = self.palette.dim
        self.screen.text(hint, (ui.WIDTH - width) // 2, _HINT_Y, 11)

    def _abandon(self, machine):
        """The hold, drawn from the first frame so letting go is a choice.

        The instruction is drawn here rather than left to draw_hold, which
        shows nothing until there is progress to show. A screen that changed
        and then said nothing for a frame reads as a badge that glitched.
        """
        self.screen.pen = self.palette.bad
        ui.block_centred(self.screen, self.shape, "HOLD", _CLOCK_Y, _CLOCK_CELL)

        instruction = "KEEP HOLDING C TO VOID THIS ONE"
        width, _ = self.screen.measure_text(instruction, 11)
        self.screen.pen = self.palette.dim
        self.screen.text(instruction, (ui.WIDTH - width) // 2, _HINT_Y, 11)

        ui.draw_hold(self.screen, self.shape, self.palette, machine.hold_progress)

    def _accent_for(self, state):
        if state == STATE_ABANDON_CONFIRM:
            return self.palette.bad
        if state in (STATE_SHORT_BREAK, STATE_LONG_BREAK):
            return self.palette.live
        if state == STATE_IDLE:
            return self.palette.dim
        return self.palette.accent


_HINTS = {
    STATE_IDLE: "A STARTS  UP DOWN SET THE LENGTH",
    STATE_WORK: "HOLD C TO ABANDON",
    STATE_SET_DONE: "A STARTS A NEW SET",
}
