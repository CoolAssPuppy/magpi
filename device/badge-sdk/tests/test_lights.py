"""The case LEDs, and everything that must not happen when they misbehave.

The fake accepts anything, which is exactly the reason these tests exist: the
firmware readings this code acts on are the ones a permissive double would let
through. So the refusals are modelled explicitly here rather than assumed.
"""

import os
import sys
import types
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from testing import fakes  # noqa: F401,E402  installs firmware stubs first

from sb import lights  # noqa: E402


class Recorder:
    def __init__(self, fail_after=None, arity=None):
        self.calls = []
        self._fail_after = fail_after
        self._arity = arity

    def __call__(self, *levels):
        if self._arity is not None and len(levels) != self._arity:
            raise TypeError("caselights takes %d arguments" % self._arity)
        if self._fail_after is not None and len(self.calls) >= self._fail_after:
            raise OSError("caselights unsupported")
        self.calls.append(levels)


class Lights(unittest.TestCase):
    def test_one_level_lights_all_four(self):
        firmware = Recorder()

        lights.Caselights(firmware).set(0.5)

        self.assertEqual(firmware.calls, [(0.5,)])

    def test_four_levels_are_passed_through_as_four(self):
        firmware = Recorder()

        lights.Caselights(firmware).set(1.0, 0.0, 1.0, 0.0)

        self.assertEqual(firmware.calls, [(1.0, 0.0, 1.0, 0.0)])

    def test_the_same_level_twice_is_not_sent_twice(self):
        # Once a frame, sixty times a second, for a change nobody can see.
        firmware = Recorder()
        case = lights.Caselights(firmware)

        case.set(0.4)
        case.set(0.4)

        self.assertEqual(len(firmware.calls), 1)

    def test_a_changed_level_is_sent(self):
        firmware = Recorder()
        case = lights.Caselights(firmware)

        case.set(0.4)
        case.set(0.6)

        self.assertEqual(firmware.calls, [(0.4,), (0.6,)])

    def test_brightness_computed_out_of_range_dims_rather_than_raises(self):
        firmware = Recorder()
        case = lights.Caselights(firmware)

        case.set(-3.0)
        case.set(9.0)

        self.assertEqual(firmware.calls, [(0.0,), (1.0,)])

    def test_a_level_that_is_not_a_number_is_off_rather_than_a_crash(self):
        firmware = Recorder()

        lights.Caselights(firmware).set(None)

        self.assertEqual(firmware.calls, [(0.0,)])

    def test_a_nan_level_is_off(self):
        firmware = Recorder()

        lights.Caselights(firmware).set(float("nan"))

        self.assertEqual(firmware.calls, [(0.0,)])

    def test_a_firmware_that_raises_is_never_called_again(self):
        firmware = Recorder(fail_after=0)
        case = lights.Caselights(firmware)

        self.assertFalse(case.set(1.0))
        self.assertFalse(case.set(0.5))
        self.assertFalse(case.available)
        self.assertEqual(firmware.calls, [])

    def test_a_firmware_that_starts_failing_stops_being_asked(self):
        firmware = Recorder(fail_after=1)
        case = lights.Caselights(firmware)

        case.set(0.2)
        case.set(0.8)
        case.set(0.9)

        self.assertEqual(firmware.calls, [(0.2,)])

    def test_a_firmware_that_refuses_four_levels_loses_the_effect_not_the_app(self):
        firmware = Recorder(arity=1)
        case = lights.Caselights(firmware)

        self.assertFalse(case.set(1.0, 0.0, 1.0, 0.0))
        self.assertFalse(case.available)

    def test_a_badge_without_the_call_does_nothing_and_says_so(self):
        case = lights.attach(types.SimpleNamespace())

        self.assertFalse(case.available)
        self.assertFalse(case.set(1.0))
        self.assertFalse(case.off())

    def test_attach_finds_the_call_on_a_badge_that_has_it(self):
        firmware = Recorder()

        case = lights.attach(types.SimpleNamespace(caselights=firmware))
        case.off()

        self.assertTrue(case.available)
        self.assertEqual(firmware.calls, [(0.0,)])


if __name__ == "__main__":
    unittest.main()
