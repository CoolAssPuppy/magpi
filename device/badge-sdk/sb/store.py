# Small durable files under /state, one per app.
#
# A badge loses power without warning: there is no shutdown, only a battery
# behind a lanyard clip and a wearer who puts it in a bag. So a write that is
# interrupted must leave either the whole old file or the whole new one, and a
# file that did not survive must read back as "nothing saved yet" rather than
# take the app down on its next boot.
#
# `path_for` is the only place a state filename is built. Pairing once wrote
# the token to one path while the SDK read another, and the badge paired and
# instantly read "not paired": reader and writer of a persisted file share one
# path constant, and a test asserts it (tests/test_store.py).

import json
import os

from . import net

# The writable location the Badgeware docs name for app data. Taken from net
# rather than repeated, because that module owns where runtime state lives.
STATE_DIR = net.STATE_DIR


def path_for(name):
    """Where the app called `name` keeps its state."""
    return "%s/%s.json" % (STATE_DIR, name)


def _set_dir(directory):
    """Point the store at a temporary directory. Tests only.

    Overriding is not enough on its own: a default that drifts is invisible to
    every test that overrides it, which is how the token path broke. So
    tests/test_store.py also asserts the shipped default against net.STATE_DIR.
    """
    global STATE_DIR
    previous = STATE_DIR
    STATE_DIR = directory
    return previous


def load(name, default=None, clean=None):
    """Read an app's saved state, or `default` if there is none worth having.

    Every failure lands on `default`: no file yet, a file truncated by a power
    cut, a file holding JSON of the wrong shape. None of those is worth a
    traceback on a badge in someone's hand, and all of them mean the same
    thing, which is that the app starts fresh.
    """
    try:
        with open(path_for(name)) as handle:
            raw = json.load(handle)
    except (OSError, ValueError):
        return _default(default)

    if clean is None:
        return raw
    try:
        return clean(raw)
    except Exception:
        # A cleaner that cannot make sense of the file is the same answer as a
        # file that would not parse.
        return _default(default)


def save(name, value, clean=None):
    """Write an app's state. Returns whether it landed.

    Best effort by design. A full or read-only filesystem costs the wearer
    their history on the next boot, which is worth strictly less than the app
    continuing to run, so the failure is reported and never raised.
    """
    target = path_for(name)
    temp = target + ".tmp"

    try:
        payload = value if clean is None else clean(value)
        # Serialised before the old file is touched. json raises TypeError on a
        # value it cannot encode, and an app that puts one in its state must
        # lose the save rather than the history it already had.
        encoded = json.dumps(payload)
        _ensure_dir()
        with open(temp, "w") as handle:
            handle.write(encoded)
        # rename over an existing file fails on the FAT ports MicroPython runs
        # on, so the old file goes first. The window where neither exists is
        # why load() treats a missing file as "start fresh" rather than an
        # error: landing in that window costs the history, not the app.
        _unlink(target)
        os.rename(temp, target)
        return True
    except (OSError, TypeError, ValueError):
        _unlink(temp)
        return False


def forget(name):
    """Drop an app's state. Used when the badge changes hands."""
    return _unlink(path_for(name))


class Cache:
    """One app's state file, bound to its name.

    Handed to a machine so the machine can remember things without importing
    the SDK, the same way fetching is handed in. It moves raw JSON in both
    directions on purpose: what a valid saved card looks like is the app's
    business, and the SDK has no way to judge it.
    """

    def __init__(self, name):
        self._name = name

    def load(self, default=None, clean=None):
        return load(self._name, default, clean)

    def save(self, value, clean=None):
        return save(self._name, value, clean)

    def forget(self):
        return forget(self._name)


def _default(default):
    # Called rather than shared, so two apps that both start empty cannot end
    # up mutating one another's default dict.
    return default() if callable(default) else default


def _ensure_dir():
    try:
        os.mkdir(STATE_DIR)
    except OSError:
        pass  # Already there, or unwritable; the open below reports which.


def _unlink(path):
    try:
        os.remove(path)
        return True
    except OSError:
        return False
