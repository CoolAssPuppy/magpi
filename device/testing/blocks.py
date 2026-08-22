"""Reading drawn type back off a fake screen.

A heading drawn from the glyph table arrives as a few hundred rectangles, so
`"CORRECT" in texts(screen)` stops working the moment a screen stops setting
its headline in a ROM font. Without something like this, making a screen look
better would mean giving up the ability to assert what it says.

The renderer is its own oracle: render the word the test expects at every
origin and cell the screen actually used, and see whether that set of
rectangles is among the ones drawn. Exact, no glyph table duplicated here, and
it fails if the font, the tracking or the run-packing changes underneath it.
"""

from sb import ui

from . import fakes


def _rects(screen):
    return [call[1] for call in screen.calls if call[0] == "shape"]


def _render(text, x, y, cell):
    probe = fakes.FakeScreen()
    ui.block_text(probe, fakes.FakeShape(), text, x, y, cell)
    return _rects(probe)


def _match(screen, text):
    """(cell, x, y) the word was drawn at, or None.

    Anchored on the renderer's own first rectangle rather than guessing at an
    origin: the top-left cell of a glyph is often blank, so the word's origin
    is usually not any drawn rectangle's corner. Rendering the word once at
    zero gives the offset from that origin to the first rectangle, and every
    drawn rectangle of the same size is then a candidate anchor.
    """
    drawn = _rects(screen)
    if not drawn or not text:
        return None
    drawn_set = set(drawn)

    for cell in sorted({rect[4] for rect in drawn}, reverse=True):
        zeroed = _render(text, 0, 0, cell)
        if not zeroed:
            continue
        first = zeroed[0]
        for rect in drawn:
            if rect[3] != first[3] or rect[4] != first[4]:
                continue
            x = rect[1] - first[1]
            y = rect[2] - first[2]
            if set(_render(text, x, y, cell)) <= drawn_set:
                return cell, x, y
    return None


def drew_block_text(screen, text):
    """Whether `text` was drawn as type, at any position and any size."""
    return _match(screen, text) is not None


def block_size(screen, text):
    """The cell size `text` was drawn at, or 0 if it was not drawn.

    Lets a test say the verdict is the largest thing on the screen without
    knowing what number that is.
    """
    found = _match(screen, text)
    return found[0] if found else 0


def block_top(screen, text):
    """The y the drawn word starts at, or None. For ordering assertions."""
    found = _match(screen, text)
    return found[2] if found else None


def excluding_block_text(screen, text):
    """Every rectangle except the ones that drew `text`.

    A screen that sets its headline as type draws a few hundred small blocks,
    which drowns any assertion about some other small thing on the same screen.
    Subtracting the word leaves the rest of the drawing to be looked at.
    """
    found = _match(screen, text)
    drawn = _rects(screen)
    if found is None:
        return drawn
    cell, x, y = found
    word = set(_render(text, x, y, cell))
    return [rect for rect in drawn if rect not in word]
