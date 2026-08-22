# The Magpi mark. Drawn as scanline rectangles, so the drawn shape can be
# read straight back off a fake screen.

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from testing.fakes import FakeColor, FakeScreen, FakeShape  # noqa: E402

from sb import brand  # noqa: E402


def draw(height, x=0, y=0):
    screen = FakeScreen()
    brand.draw_mark(screen, FakeShape(), FakeColor(), x, y, height)
    return screen


def runs_by_pen(screen):
    """Every rectangle, grouped under the pen that was set before it."""
    by_pen = {}
    pen = None
    for call in screen.calls:
        if call[0] == "pen":
            pen = call[1]
        elif call[0] == "shape":
            by_pen.setdefault(pen, []).append(call[1])
    return by_pen


class TestMarkSize(unittest.TestCase):
    def test_width_follows_the_viewbox_ratio(self):
        self.assertEqual(brand.mark_size(20), 26)
        self.assertEqual(brand.mark_size(40), 52)

    def test_width_is_a_whole_number_of_pixels(self):
        # Callers lay the mark out beside text, and a float offset puts the
        # words half a pixel off the baseline they were measured against.
        self.assertIsInstance(brand.mark_size(22), int)


class TestDrawMark(unittest.TestCase):
    def test_three_folds_are_drawn_in_three_tones(self):
        by_pen = runs_by_pen(draw(40))

        self.assertEqual(
            sorted(by_pen.keys()),
            sorted([brand.CHALK, brand.SHADE, brand.SHEEN]),
        )
        for pen, rects in by_pen.items():
            self.assertTrue(rects, "%s drew nothing" % (pen,))

    def test_every_row_is_one_pixel_tall(self):
        # The fill is scanlines. A taller rectangle means the row stepping
        # broke and the triangle is being drawn as a block.
        for _, x, y, w, h in [r for rs in runs_by_pen(draw(40)).values() for r in rs]:
            self.assertEqual(h, 1)
            self.assertGreater(w, 0)

    def test_the_mark_stays_inside_the_box_it_was_given(self):
        height = 40
        width = brand.mark_size(height)
        for _, x, y, w, h in [r for rs in runs_by_pen(draw(height, 12, 30)).values() for r in rs]:
            self.assertGreaterEqual(x, 12)
            self.assertLessEqual(x + w, 12 + width + 1)
            self.assertGreaterEqual(y, 30)
            self.assertLessEqual(y, 30 + height)

    def test_a_taller_mark_draws_more_rows(self):
        small = sum(len(r) for r in runs_by_pen(draw(20)).values())
        large = sum(len(r) for r in runs_by_pen(draw(60)).values())
        self.assertGreater(large, small)


if __name__ == "__main__":
    unittest.main()
