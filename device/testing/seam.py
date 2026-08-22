# Loading an app's __init__.py under CPython.
#
# BadgeOS puts `badge`, `screen`, `rect`, `run` and the BUTTON_* names into an
# app's namespace before it runs it. Under CPython every one of those is a
# NameError at import time, which is why the seam was the one file per app with
# no test, and the one place a mode swap or a dropped firmware global could
# ship green.

import importlib.util
import os
import sys

from . import fakes  # noqa: F401  installs the firmware stubs on import

DEVICE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_seam(app_dir, screen=None):
    """Import an app's real __init__.py against fake hardware.

    Returns `(module, injected)`. The module is the shipped seam: the RunSpec,
    the button table and the update() it hands to `run()` are the ones the
    badge gets, not a copy written for the test.
    """
    app_dir = os.path.abspath(app_dir)
    for path in (os.path.join(DEVICE_ROOT, "badge-sdk"), DEVICE_ROOT, app_dir):
        if path not in sys.path:
            sys.path.insert(0, path)

    injected = fakes.install_firmware_globals(screen)
    # Cleared rather than trusted: an earlier load in the same process would
    # otherwise let an app that never sets the mode inherit a passing one.
    fakes.fake_badge.display_mode = None
    fakes.run.update = None

    location = os.path.join(app_dir, "__init__.py")
    spec = importlib.util.spec_from_file_location("app_seam", location)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module, injected


def build(module, fetch=None):
    """The machine and the view the RunSpec actually produces.

    Building both is the point: a make_view lambda that references a name the
    seam failed to capture raises here rather than on the first frame drawn in
    somebody's hand.
    """
    spec = module._SPEC
    machine = spec.make_machine(fetch if fetch is not None else spec.fetch)
    view = spec.make_view(fakes.FakeScreen(), fakes.FakeShape(), fakes.FakeColor())
    return machine, view
