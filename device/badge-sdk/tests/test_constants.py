# The generated device constants, and the one geometry they must agree with.

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sb.constants import AVATAR_BOX, IMAGE_BAND_H, IMAGE_BAND_W, MAX_LIVE_QUESTIONS  # noqa: E402
from sb.ui import MARGIN, WIDTH  # noqa: E402


class TestConstants(unittest.TestCase):
    def test_values_are_the_generated_ones(self):
        # If these change, they change in device-constants.json, not here.
        self.assertEqual(AVATAR_BOX, 88)
        self.assertEqual(IMAGE_BAND_W, 304)
        self.assertEqual(IMAGE_BAND_H, 64)
        self.assertEqual(MAX_LIVE_QUESTIONS, 12)

    def test_band_width_is_the_screen_minus_margins(self):
        # The web uploads the band at IMAGE_BAND_W; the badge draws it full
        # width less both margins. They must be the same number.
        self.assertEqual(IMAGE_BAND_W, WIDTH - MARGIN * 2)


if __name__ == "__main__":
    unittest.main()
