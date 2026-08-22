# The four LEDs in the badge's case.
#
# Decoration, and treated as decoration throughout: a firmware without the call
# loses the effect, a call that raises loses the effect, and neither loses the
# app. The first failure switches the lights off for the rest of the session
# rather than being retried once a frame, because a primitive that raised once
# will raise sixty times a second and the cost of finding that out again is
# paid out of the frame budget.
#
# `badge.caselights` takes one level for all four or one level each, both in
# the range 0.0 to 1.0 (badgeware-docs api/badge.md).

LEVELS = 4


class Caselights:
    """The case LEDs, or a convincing impression of nothing at all."""

    def __init__(self, caselights=None):
        self._call = caselights
        self._last = None

    @property
    def available(self):
        return self._call is not None

    def set(self, *levels):
        """Set all four, or one each. Returns whether the firmware took it.

        A repeat of the level already showing is dropped. This runs once a
        frame and the wearer cannot see a value being set twice, so the cheap
        thing to do with it is nothing.
        """
        if self._call is None:
            return False
        values = tuple(_clamp(level) for level in levels) or (0.0,)
        if values == self._last:
            return True
        try:
            self._call(*values)
        except Exception:
            # Unsupported, or a firmware that refuses this arity. Either way
            # the app keeps running and never asks again.
            self._call = None
            self._last = None
            return False
        self._last = values
        return True

    def off(self):
        return self.set(0.0)


def _clamp(level):
    """A level the firmware will accept, from whatever the app worked out.

    Brightness is computed from animation maths, and maths that drifts a
    fraction outside the range must dim a light rather than raise.
    """
    try:
        value = float(level)
    except (TypeError, ValueError):
        return 0.0
    if value != value:  # NaN, which no comparison below would catch
        return 0.0
    if value < 0.0:
        return 0.0
    if value > 1.0:
        return 1.0
    return value


def attach(badge_module):
    """The case lights on this badge, from the firmware module BadgeOS injects.

    Called at an app's seam, where the firmware globals are in scope. A build
    without the call gets an object that does nothing, so no app needs to ask
    whether it is running on hardware that has the LEDs.
    """
    return Caselights(getattr(badge_module, "caselights", None))
