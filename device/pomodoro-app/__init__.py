# Pomodoro: a timer with physical buttons and the case LEDs.
#
# No BadgeApp. That runtime exists to handle pairing, the WiFi settle and the
# token, and this app has none of those: it never touches the radio, so there
# is no cold join to pay for and it opens in under a second. That matters
# because you open it at the moment you decide to start working.
#
# The three-file split is the same as every other app. This is the only file
# that touches the firmware globals.

import sys

try:
    _HERE = __file__.rsplit("/", 1)[0]
except (NameError, AttributeError):  # pragma: no cover - frozen builds
    _HERE = "/system/apps/Pomodoro"
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

SDK_DIR = "/system/badge/sdk"
if SDK_DIR not in sys.path:
    sys.path.append(SDK_DIR)

# The screen lays out for 320x240. The badge boots at 160x120.
try:
    badge.mode(HIRES | VSYNC)  # noqa: F821
except (NameError, AttributeError):  # pragma: no cover - host and emulator
    pass

import sb.lights
import sb.store

from pomodoro import Pomodoro
from pomodoro_ui import PomodoroScreen

# Written by Notifier from the payload it is already fetching. Reading a file
# is not a network call, so this app still opens instantly whether or not
# Notifier has ever run.
SETTINGS_NAME = "pomodoro"
LOG_NAME = "pomodoro_log"


class RtcClock:
    """Local date from the RTC, which keeps running through sleep.

    Wrapped rather than passed raw so the machine takes a one-method object it
    can be handed a fake for, and never learns that `rtc` exists.
    """

    def __init__(self, rtc_module):
        self._rtc = rtc_module

    def local_date(self):
        year, month, day = self._rtc.datetime()[:3]
        return "%04d-%02d-%02d" % (year, month, day)


try:
    _RTC = rtc  # noqa: F821
except NameError:  # pragma: no cover - host and emulator
    _RTC = None

_MACHINE = Pomodoro(
    settings_cache=sb.store.Cache(SETTINGS_NAME),
    log_cache=sb.store.Cache(LOG_NAME),
    clock=RtcClock(_RTC),
)

_VIEW = PomodoroScreen(screen, shape, color)  # noqa: F821
_LIGHTS = sb.lights.attach(badge)  # noqa: F821

# A is start and next. UP and DOWN set the length while idle. C is the abandon
# hold. B is unused: there is nothing here it could mean, and a button that
# does something unexpected on a timer is worse than one that does nothing.
_EDGE = {}


def _pressed(button):
    """True on the frame a button goes down, so a held A fires once."""
    is_down = badge.pressed(button)  # noqa: F821
    was_down = _EDGE.get(button, False)
    _EDGE[button] = is_down
    return is_down and not was_down


def update():
    now = badge.ticks  # noqa: F821

    _MACHINE.tick(now)

    if _pressed(BUTTON_A):  # noqa: F821
        _MACHINE.press_a(now)
    if _pressed(BUTTON_UP):  # noqa: F821
        _MACHINE.press_up(now)
    if _pressed(BUTTON_DOWN):  # noqa: F821
        _MACHINE.press_down(now)

    # Read every frame rather than on an edge: the hold has to know that C is
    # still down, and it arms itself on a release.
    _MACHINE.hold_c(now, badge.pressed(BUTTON_C))  # noqa: F821

    _VIEW.draw(_MACHINE)
    _LIGHTS.set(*_MACHINE.leds(now))


run(update)  # noqa: F821
