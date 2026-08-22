# The generated device constants, and the one geometry they must agree with.

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sb import constants  # noqa: E402
from sb.ui import HEIGHT, WIDTH  # noqa: E402


class TestConstants(unittest.TestCase):
    def test_values_are_the_generated_ones(self):
        # If these change, they change in device-constants.json, not here.
        self.assertEqual(constants.SCREEN_W, 320)
        self.assertEqual(constants.SCREEN_H, 240)
        self.assertEqual(constants.DEFAULT_POLL_MS, 30000)
        self.assertEqual(constants.MIN_POLL_MS, 5000)
        self.assertEqual(constants.TITLE_MAX, 48)
        self.assertEqual(constants.SUBJECT_MAX, 40)
        self.assertEqual(constants.COUNTER_MAX, 4)
        self.assertEqual(constants.SPARK_POINTS, 30)
        self.assertEqual(constants.DAY_BLOCKS, 24)
        self.assertEqual(constants.DAY_START_HOUR, 7)
        self.assertEqual(constants.PAYLOAD_MAX_BYTES, 8192)
        self.assertEqual(constants.LED_LEVELS, 4)

    def test_page_slugs_is_a_five_tuple(self):
        # A tuple, not a list: the pager indexes it every frame and nothing
        # on the badge may edit it.
        self.assertIsInstance(constants.PAGE_SLUGS, tuple)
        self.assertEqual(len(constants.PAGE_SLUGS), 5)
        self.assertEqual(
            constants.PAGE_SLUGS,
            ("next_thing", "day_shape", "deploys", "counters", "one_number"),
        )

    def test_pomodoro_defaults_are_present(self):
        self.assertEqual(constants.POMODORO_WORK_MIN, 25)
        self.assertEqual(constants.POMODORO_SHORT_MIN, 5)
        self.assertEqual(constants.POMODORO_LONG_MIN, 20)
        self.assertEqual(constants.POMODORO_SESSIONS, 4)
        self.assertIs(constants.POMODORO_LEDS, True)

    def test_screen_size_is_the_size_the_drawing_code_lays_out_for(self):
        # ui.py hardcodes its own copy for MicroPython's sake. The two must
        # not drift, or every layout number in it is measured against a
        # screen the badge does not have.
        self.assertEqual(constants.SCREEN_W, WIDTH)
        self.assertEqual(constants.SCREEN_H, HEIGHT)


if __name__ == "__main__":
    unittest.main()
