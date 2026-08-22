# Test doubles shared by every device test suite (badge-sdk, supabase-app).
# Importing this module installs a fake `requests` module and
# BadgeOS runtime stubs before any app or SDK code can import the real ones,
# so import it first in every test module. CPython only; never shipped.
import json
import sys
import types


class FakePeerSocket:
    """Stands in for a port that keeps the SSLSocket on the response, so the
    SDK can fingerprint the peer certificate. Pass cert=None to model a port
    that exposes a socket but no certificate."""

    def __init__(self, cert=None):
        self._cert = cert

    def getpeercert(self, binary_form=False):
        return self._cert


class FakeResponse:
    def __init__(self, status_code=200, payload=None, content=None, peer_cert=None):
        self.status_code = status_code
        # Only ports that can expose the peer certificate get a `raw`; stock
        # urequests has no such attribute.
        if peer_cert is not None:
            self.raw = FakePeerSocket(peer_cert)
        self._payload = payload if payload is not None else {}
        if content is not None:
            self.content = content
        elif payload is not None:
            self.content = json.dumps(self._payload).encode("utf-8")
        else:
            self.content = b""
        self.closed = False

    def json(self):
        return self._payload

    def close(self):
        self.closed = True


class FakeRequests(types.ModuleType):
    """Stands in for MicroPython's requests module under CPython."""

    def __init__(self):
        super().__init__("requests")
        self.handler = None
        self.calls = []

    def request(self, method, url, headers=None, data=None):
        self.calls.append({"method": method, "url": url, "headers": headers, "data": data})
        if self.handler is None:
            raise AssertionError("no handler installed on fake requests")
        return self.handler(method, url, headers, data)

    # Convenience wrappers mirroring the real module.
    def get(self, url, headers=None):
        return self.request("GET", url, headers=headers)

    def post(self, url, headers=None, data=None):
        return self.request("POST", url, headers=headers, data=data)


fake_requests = FakeRequests()
sys.modules["requests"] = fake_requests


class FakeScreen:
    """Records pen sets, clears, text, and shape calls for assertions."""

    # The size a badge reports after badge.mode(HIRES). Present because the
    # drawing code asks the screen rather than assuming, and a fake with no
    # size would let it silently fall back to a constant and prove nothing.
    def __init__(self, width=320, height=240):
        self.calls = []
        self._pen = None
        self.width = width
        self.height = height

    @property
    def pen(self):
        return self._pen

    @pen.setter
    def pen(self, value):
        self._pen = value
        self.calls.append(("pen", value))

    def clear(self):
        self.calls.append(("clear",))

    def text(self, message, x, y, size=6):
        self.calls.append(("text", message, x, y, size))

    def shape(self, s):
        self.calls.append(("shape", s))

    # PicoGraphics primitives used by stock Badgeware apps and MAD. Kept
    # distinct from vector `shape` calls so tests can assert which firmware
    # boundary was exercised.
    def rectangle(self, x, y, w, h):
        self.calls.append(("rectangle", x, y, w, h))

    def circle(self, *args):
        self.calls.append(("circle",) + args)

    def line(self, *args):
        self.calls.append(("line",) + args)

    def blit(self, source, *where):
        """Records the picture and where it was put. `where` is whatever the
        caller passed: a point, or a rectangle to scale into."""
        self.calls.append(("blit", source) + tuple(where))

    def measure_text(self, message, size=6):
        return (len(message) * size, size)

    def texts(self):
        return [c for c in self.calls if c[0] == "text"]


class FakeBadge(types.ModuleType):
    """Stands in for the BadgeOS `badge` module: controllable ticks, no
    buttons ever down, and the BUTTON_* constants."""

    def __init__(self):
        super().__init__("badge")
        self.ticks = 0
        self.uid = "e6614103fake0001"
        self.display_mode = None
        for name in ("A", "B", "C", "UP", "DOWN", "HOME"):
            setattr(self, "BUTTON_" + name, "BUTTON_" + name)

    def advance(self, ms):
        self.ticks += ms
        return self.ticks

    def mode(self, value=None):
        if value is not None:
            self.display_mode = value
        return self.display_mode

    def pressed(self, button):
        return False

    def held(self, button):
        return False

    def released(self, button):
        return False

    def changed(self, button):
        return False

    def battery_level(self):
        return 100

    def battery_voltage(self):
        return 4.1

    def usb_connected(self):
        return True

    def is_charging(self):
        return False

    def disk_free(self, path):
        return 8 * 1024 * 1024

    def caselights(self, *args):
        pass


fake_badge = FakeBadge()
sys.modules["badge"] = fake_badge


class _RunCapture:
    """Fake for the BadgeOS `run(update)` entry point: captures the update
    function so tests can drive frames by calling it."""

    def __init__(self):
        self.update = None

    def __call__(self, update):
        self.update = update


run = _RunCapture()


# BadgeOS injects these into app code (or exposes them as modules); under
# CPython they only need to be importable plain namespaces. Tests attach
# whatever attributes the code under test uses.
# `image` is deliberately absent: BadgeOS injects it into an app's
# namespace and there is no module to import on the badge. Registering a
# fake one here let `import image` succeed under test and fail on hardware,
# which is exactly the bug it was supposed to catch.
for _name in ("shape", "color", "font", "mat3", "rtc"):
    if _name not in sys.modules:
        sys.modules[_name] = types.ModuleType(_name)


class FakeColor:
    """The firmware `color` module: packs a triple, and that is all the app
    asks of it."""

    def rgb(self, r, g, b):
        return (r, g, b)


class FakeImage:
    """The firmware `image` module, as much of it as the apps use.

    `load` returns a descriptor rather than pixels: the drawing tests care
    where a picture was placed and at what size, and a framebuffer would tell
    them nothing they assert on. A path the test has not registered raises,
    exactly as the firmware does for a file that is not there."""

    def __init__(self, loads_any=False):
        self.loadable = set()
        self.loaded = []
        self.loads_any = loads_any

    def allow(self, path, width=512, height=512):
        self.loadable.add(path)
        return path

    def load(self, path):
        if not self.loads_any and path not in self.loadable:
            raise OSError("no such file: %s" % path)
        self.loaded.append(path)
        return ("image", path)


def FakeRect(x, y, w, h):
    """BadgeOS's `rect` constructor. A descriptor the FakeScreen records, so a
    scaling blit can be asserted on without a framebuffer."""
    return ("rect", x, y, w, h)


class FakeShape:
    """The firmware `shape` module. Returns descriptors the FakeScreen records,
    so drawing tests can assert on geometry without a framebuffer."""

    def rectangle(self, x, y, w, h):
        return ("rect", x, y, w, h)

    def circle(self, x, y, r):
        return ("circle", x, y, r)


def install_firmware_globals(screen=None):
    """Put the names BadgeOS injects into builtins, and return them.

    An app module reaches `badge`, `screen`, `run` and the BUTTON_* constants
    as bare globals: the firmware's loader puts them there, so nothing in the
    app imports them. Under CPython that is a NameError at import time, which
    is why __init__.py, the module that wires the app together, was the only
    one with no test and the only one where a mode-swap bug could ship.

    Builtins rather than module globals because the app is imported as a
    package and its submodules reach the same names.
    """
    import builtins

    fake_screen = screen if screen is not None else FakeScreen()
    injected = {
        "badge": fake_badge,
        "screen": fake_screen,
        "shape": FakeShape(),
        "image": FakeImage(),
        "color": FakeColor(),
        # `rect` is injected by BadgeOS the same way `image` is, and it is what
        # makes a blit scale. Leaving it out let every seam capture None and
        # call the scaling path dead under test while it worked on hardware.
        "rect": FakeRect,
        "rom_font": types.SimpleNamespace(sins="sins"),
        "run": run,
        # Numeric flags, matching Badgeware's builtins, so combined display
        # modes exercise the hardware path under CPython.
        "HIRES": 0b01,
        "VSYNC": 0b10,
    }
    for _name in ("A", "B", "C", "UP", "DOWN", "HOME"):
        injected["BUTTON_" + _name] = "BUTTON_" + _name
    for _name, _value in injected.items():
        setattr(builtins, _name, _value)
    return injected


class ButtonQueue:
    """Scripts button presses for a frame-loop test.

    `badge.pressed()` is level-triggered on the device and answers for the
    frame being drawn. Tests need one press to land on exactly one frame, so
    this hands out a press once and then goes quiet.
    """

    def __init__(self, badge_module=None):
        self._badge = badge_module if badge_module is not None else fake_badge
        self._pending = set()
        self._holding = set()
        self._badge.pressed = self._pressed
        self._badge.held = self._held

    def press(self, button):
        self._pending.add(button)

    def hold(self, button):
        """A long press. The runtime treats this as "open pairing"."""
        self._holding.add(button)

    def _pressed(self, button):
        return button in self._pending

    def _held(self, button):
        return button in self._holding

    def frame(self, update, advance_ms=16):
        """Run one frame with whatever is queued, then clear it."""
        update()
        self._pending.clear()
        self._holding.clear()
        self._badge.advance(advance_ms)
