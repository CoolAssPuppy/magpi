# The page registry.
#
# Each module exports a SLUG, a draw(ctx), and optionally leds(data, now_ms)
# returning four levels and on_a(machine, now_ms) for the page's own action.
#
# The order and the enabled set come from the payload, never from here. A slug
# this build does not recognise is skipped without an error, which is what lets
# the server ship a new page before a badge has been updated.

from . import counters, day_shape, deploys, next_thing, one_number

_MODULES = (next_thing, day_shape, deploys, counters, one_number)

REGISTRY = {module.SLUG: module for module in _MODULES}

KNOWN_SLUGS = tuple(REGISTRY)


def get(slug):
    """The module for a slug, or None if this build cannot draw it."""
    return REGISTRY.get(slug)


class Ctx:
    """Everything a page is allowed to see.

    A page that needs more than this is a page whose data is shaped wrong on
    the server, so the fix belongs in the builder rather than here.
    """

    __slots__ = ("screen", "shape", "palette", "data", "state", "age_ms", "now_ms")

    def __init__(self, screen, shape, palette, data, state, age_ms, now_ms):
        self.screen = screen
        self.shape = shape
        self.palette = palette
        self.data = data
        self.state = state
        self.age_ms = age_ms
        self.now_ms = now_ms
