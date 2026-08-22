# Notifier: the badge stays up, joins WiFi once, and pages between screens.
#
# The only file here that knows the SDK exists. notifier.py, notifier_ui.py and
# everything under pages/ are plain Python, which is what lets them be tested
# off-device, and every SDK failure is translated into this app's own
# vocabulary at the seam below.
#
# Pairing, the WiFi settle, the battery reading and the handover when a badge
# is revoked all live in sb.app.

import sys

# Put this app's own directory on sys.path before importing its siblings.
# BadgeOS is not guaranteed to: whether an app's folder ends up on sys.path is
# a property of the firmware's loader, not of Python.
try:
    _HERE = __file__.rsplit("/", 1)[0]
except (NameError, AttributeError):  # pragma: no cover - frozen builds
    _HERE = "/system/apps/Notifier"
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

# The SDK is installed once at /system/badge/sdk so every app shares one copy.
SDK_DIR = "/system/badge/sdk"
if SDK_DIR not in sys.path:
    sys.path.append(SDK_DIR)

# The screen lays out for 320x240. The badge boots at 160x120, so without this
# every coordinate addresses twice the space that exists.
try:
    badge.mode(HIRES | VSYNC)  # noqa: F821
except (NameError, AttributeError):  # pragma: no cover - host and emulator
    pass

import sb
import sb.lights
import sb.store
from sb.app import BadgeApp, Env, RunSpec

import pages
from notifier import STATE_UNPAIRED, Notifier, Unpaired, Unreachable
from notifier_ui import NotifierScreen

APP_SLUG = "notifier"


def _fetch_desk(power=None):
    """The one route either app calls, with every SDK failure renamed.

    A dead token, a limiter asking for thirty seconds and a radio that dropped
    mid-request are three different things to do about a failure. An
    `except Exception` makes them one, and only the last is worth retrying at
    the healthy interval.
    """
    try:
        return sb.desk(power)
    except sb.NotPaired as error:
        raise Unpaired(str(error))
    except sb.RateLimited as error:
        raise Unreachable(str(error), retry_after=error.retry_after)
    except sb.SdkError as error:
        raise Unreachable(str(error))


def _make_machine(fetch):
    return Notifier(
        fetch,
        cache=sb.store.Cache(APP_SLUG),
        # Written here, read by Pomodoro. One module owns the name so the two
        # halves cannot drift onto different files.
        pomodoro_cache=sb.store.Cache("pomodoro"),
        known_slugs=pages.KNOWN_SLUGS,
    )


# UP and DOWN page. A is the current page's own action. C refetches. B is the
# runtime's on every screen, which is worth more than a third action: it is the
# escape that works when the badge is in trouble.
_BUTTONS = {
    BUTTON_UP: lambda machine, now: machine.previous_page(now),  # noqa: F821
    BUTTON_DOWN: lambda machine, now: machine.next_page(now),  # noqa: F821
    BUTTON_A: lambda machine, now: _page_action(machine, now),  # noqa: F821
    BUTTON_C: lambda machine, now: machine.refetch_now(now),  # noqa: F821
}


def _page_action(machine, now_ms):
    """A, routed to whichever page is showing. A page without one ignores it."""
    module = pages.get(machine.current_slug)
    action = getattr(module, "on_a", None) if module else None
    if action is not None:
        action(machine, now_ms)


_SPEC = RunSpec(
    make_machine=_make_machine,
    make_view=lambda screen, shape, color: NotifierScreen(screen, shape, color),
    fetch=_fetch_desk,
    unpaired_state=STATE_UNPAIRED,
    buttons=_BUTTONS,
    claims_b=False,
)

_APP = BadgeApp(
    _SPEC,
    Env(badge, screen, shape, color, BUTTON_A, BUTTON_B),  # noqa: F821
)

sb._set_app_slug(APP_SLUG)

_LIGHTS = sb.lights.attach(badge)  # noqa: F821


def _drive_leds(machine):
    """Whatever the current page asks for, or dark.

    caselights raises on a firmware without them, which sb.lights already
    swallows. A page that returns nothing gets dark rather than the last page's
    levels left burning.
    """
    module = pages.get(machine.current_slug)
    levels = None
    if module is not None and hasattr(module, "leds"):
        page = machine.current_page or {}
        levels = module.leds(page.get("data") or {}, machine.now_ms)
    _LIGHTS.set(*(levels or (0.0, 0.0, 0.0, 0.0)))


def update():
    _APP.update()
    # Only while the app owns the screen. Pairing has taken over otherwise, and
    # its machine has no pages.
    machine = _APP.machine
    if machine is not None and hasattr(machine, "current_slug"):
        _drive_leds(machine)


run(update)  # noqa: F821
