"""Records what every Notifier page actually draws, as JSON on stdout.

The device pages and the web previews draw the same layout in two languages,
and they will drift. This runs the real Python pages against a recording
screen and writes down the result: every box, every font size, and every
string after truncation. The web suite asserts its previews against that file.

Change a device layout, run `pnpm previews:fixtures`, and the web tests fail
until the preview catches up.

Two gotchas when porting a layout to TypeScript: Python's `%` is non-negative
for a negative left operand and JavaScript's is not, and Python's `int()`
truncates where `Math.round` does not.

    python3 -m tools.record_previews
"""

import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_APP = os.path.dirname(_HERE)
for path in (_APP, os.path.dirname(_APP), os.path.join(os.path.dirname(_APP), "badge-sdk")):
    if path not in sys.path:
        sys.path.insert(0, path)

from testing import fakes  # noqa: E402  (installs the firmware fakes)

import pages  # noqa: E402
from sb import ui  # noqa: E402

from tools.fixtures import FIXTURES, STATES  # noqa: E402


def _record(module, data, state):
    """One page, one payload, one state, as a list of drawing operations."""
    screen = fakes.FakeScreen()
    with _headlines_as_one_op(screen) as headlines:
        module.draw(
            pages.Ctx(
                screen=screen,
                shape=fakes.FakeShape(),
                palette=ui.Palette(fakes.FakeColor()),
                data=data,
                state=state,
                age_ms=0,
                # Fixed, so a pulsing LED records the same frame every run. A
                # recording that changed with the clock would fail the drift
                # check for no reason.
                now_ms=0,
            )
        )
    return _operations(screen, headlines)


class _headlines_as_one_op:
    """Records a drawn headline as its text, not its few hundred rectangles.

    block_text renders a 5 by 7 glyph grid one run at a time, so a word arrives
    as hundreds of rects. Kept raw, the fixture is half a megabyte of pixels
    and any font tweak rewrites all of it, which makes the drift check noise.
    What the web preview has to agree about is the word, where it starts, and
    how big a cell is.
    """

    def __init__(self, screen):
        self._screen = screen
        self._original = ui.block_text
        self.spans = {}

    def __enter__(self):
        def recording(screen, shape, text, x, y, cell):
            start = len(screen.calls)
            end_x = self._original(screen, shape, text, x, y, cell)
            self.spans[start] = {
                "op": "block",
                "text": text.upper(),
                "x": x,
                "y": y,
                "cell": cell,
                "rects": len(screen.calls) - start,
            }
            return end_x

        ui.block_text = recording
        # The page modules imported block_text by module reference, so patching
        # ui is enough. A page that did `from sb.ui import block_text` would
        # need patching there too, and none does.
        return self.spans

    def __exit__(self, *exc):
        ui.block_text = self._original
        return False


def _operations(screen, headlines):
    operations = []
    skip_until = -1
    for index, call in enumerate(screen.calls):
        headline = headlines.get(index)
        if headline is not None:
            operations.append({k: v for k, v in headline.items() if k != "rects"})
            skip_until = index + headline["rects"]
        if index < skip_until:
            continue
        kind = call[0]
        if kind == "text":
            message, x, y, size = call[1], call[2], call[3], call[4]
            operations.append({"op": "text", "text": message, "x": x, "y": y, "size": size})
        elif kind == "shape":
            box = call[1]
            # FakeShape tags each primitive. Anything but a rectangle is one no
            # page uses yet, and recording it named is better than dropping it.
            if isinstance(box, tuple) and box and box[0] == "rect":
                operations.append(
                    {"op": "rect", "x": box[1], "y": box[2], "w": box[3], "h": box[4]}
                )
            else:
                operations.append({"op": "shape", "value": str(box)})
        elif kind == "pen":
            operations.append({"op": "pen", "value": _pen(call[1])})
    return operations


def _pen(value):
    """FakeColor hands back whatever rgb() was called with."""
    if isinstance(value, (tuple, list)):
        return "#%02x%02x%02x" % tuple(int(channel) for channel in value[:3])
    return str(value)


def _leds(module, data):
    if not hasattr(module, "leds"):
        return None
    return [round(float(level), 3) for level in module.leds(data, 0)]


def record():
    recorded = {
        "screen": {"w": ui.WIDTH, "h": ui.HEIGHT},
        "fonts": ui.ROM_FONT_SIZES,
        "pages": {},
    }

    for slug in sorted(pages.REGISTRY):
        module = pages.REGISTRY[slug]
        entry = {"name": module.NAME, "cases": {}, "states": {}}

        for case, data in sorted(FIXTURES.get(slug, {}).items()):
            entry["cases"][case] = {
                "data": data,
                "draw": _record(module, data, "ok"),
                "leds": _leds(module, data),
            }

        for state in STATES:
            entry["states"][state] = _record(module, {}, state)

        recorded["pages"][slug] = entry

    return recorded


if __name__ == "__main__":
    json.dump(record(), sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
