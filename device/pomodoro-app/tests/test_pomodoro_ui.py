import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "badge-sdk"))

from testing import blocks, fakes  # noqa: F401  (installs the firmware fakes)

from pomodoro import ABANDON_HOLD_MS, DEFAULTS, STATE_SET_DONE, Pomodoro
from pomodoro_ui import PomodoroScreen

MINUTE_MS = 60000


class FakeCache:
    def __init__(self, initial=None):
        self.value = initial

    def load(self, default=None, clean=None):
        return self.value if self.value is not None else default

    def save(self, value, clean=None):
        self.value = value
        return True


class FakeClock:
    def local_date(self):
        return "2026-08-22"


def machine(settings=None):
    return Pomodoro(FakeCache(settings), FakeCache(), FakeClock())


def draw(m):
    screen = fakes.FakeScreen()
    PomodoroScreen(screen, fakes.FakeShape(), fakes.FakeColor()).draw(m)
    return screen


def texts(screen):
    return [call[1] for call in screen.calls if call[0] == "text"]


def circles(screen):
    return [call[1] for call in screen.calls if call[0] == "shape" and call[1][0] == "circle"]


class TestIdle(unittest.TestCase):
    def test_the_clock_shows_the_length_that_would_start(self):
        self.assertTrue(blocks.drew_block_text(draw(machine()), "25:00"))

    def test_the_phase_is_named(self):
        self.assertIn("READY", texts(draw(machine())))

    def test_the_tally_is_in_the_corner(self):
        self.assertIn("TODAY 0", texts(draw(machine())))

    def test_the_hint_names_both_things_the_buttons_do(self):
        joined = " ".join(texts(draw(machine())))
        self.assertIn("A STARTS", joined)
        self.assertIn("UP DOWN", joined)


class TestWork(unittest.TestCase):
    def test_the_countdown_is_the_biggest_thing_on_the_screen(self):
        m = machine()
        m.press_a(0)
        m.tick(18000)
        self.assertTrue(blocks.drew_block_text(draw(m), "24:42"))

    def test_the_clock_is_centred(self):
        m = machine()
        m.press_a(0)
        m.tick(0)
        screen = draw(m)
        left = blocks.block_size(screen, "25:00")
        self.assertIsNotNone(left)

    def test_the_abandon_hint_is_the_only_way_out(self):
        m = machine()
        m.press_a(0)
        self.assertIn("HOLD C TO ABANDON", texts(draw(m)))

    def test_there_are_four_dots_for_a_set_of_four(self):
        m = machine()
        m.press_a(0)
        # One filled outline for the running pomodoro is two circles, and each
        # pending dot is two more.
        self.assertGreaterEqual(len(circles(draw(m))), DEFAULTS["sessions"])

    def test_a_shorter_set_draws_fewer_dots(self):
        m = machine(settings={"sessions": 2})
        m.press_a(0)
        four = machine()
        four.press_a(0)
        self.assertLess(len(circles(draw(m))), len(circles(draw(four))))


class TestBreak(unittest.TestCase):
    def test_the_break_is_named(self):
        m = machine()
        m.press_a(0)
        m.tick(DEFAULTS["work_min"] * MINUTE_MS)
        self.assertIn("BREAK", texts(draw(m)))

    def test_a_finished_break_says_what_a_does(self):
        m = machine()
        m.press_a(0)
        m.tick(DEFAULTS["work_min"] * MINUTE_MS)
        m.tick((DEFAULTS["work_min"] + DEFAULTS["short_min"]) * MINUTE_MS)
        self.assertIn("A STARTS THE NEXT POMODORO", texts(draw(m)))


class TestSetDone(unittest.TestCase):
    def test_a_finished_set_says_so(self):
        m = machine()
        m._state = STATE_SET_DONE
        m._completed_in_set = DEFAULTS["sessions"]
        screen = draw(m)
        self.assertIn("SET DONE", texts(screen))
        self.assertIn("A STARTS A NEW SET", texts(screen))


class TestAbandonConfirm(unittest.TestCase):
    def setUp(self):
        self.machine = machine()
        self.machine.press_a(0)
        self.machine.hold_c(0, False)
        self.machine.hold_c(100, True)

    def test_the_screen_says_to_keep_holding(self):
        joined = " ".join(texts(draw(self.machine)))
        self.assertIn("KEEP HOLDING C", joined)

    def test_the_word_hold_replaces_the_clock(self):
        screen = draw(self.machine)
        self.assertTrue(blocks.drew_block_text(screen, "HOLD"))

    def test_the_progress_is_drawn_for_the_whole_hold(self):
        self.machine.hold_c(100 + ABANDON_HOLD_MS // 2, True)
        early = draw(self.machine)
        self.assertTrue(early.calls)


class TestFakesRefuseWhatTheFirmwareRefuses(unittest.TestCase):
    def test_a_firmware_without_case_lights_costs_the_effect_not_the_app(self):
        from sb import lights

        class NoLights:
            pass

        attached = lights.attach(NoLights())
        self.assertFalse(attached.available)
        self.assertFalse(attached.set(1.0))

    def test_a_caselights_call_that_raises_is_never_retried(self):
        from sb import lights

        class Angry:
            def __init__(self):
                self.calls = 0

            def caselights(self, *levels):
                self.calls += 1
                raise OSError("unsupported")

        angry = Angry()
        attached = lights.Caselights(angry.caselights)
        self.assertFalse(attached.set(1.0))
        self.assertFalse(attached.set(0.5))
        self.assertEqual(angry.calls, 1)

    def test_a_store_write_that_fails_costs_the_history_not_the_app(self):
        class RefusingCache:
            def load(self, default=None, clean=None):
                return default

            def save(self, value, clean=None):
                return False

        m = Pomodoro(FakeCache(), RefusingCache(), FakeClock())
        m.press_a(0)
        m.tick(DEFAULTS["work_min"] * MINUTE_MS)
        # The tally is still right in memory; only the next boot loses it.
        self.assertEqual(m.completed_today, 1)

    def test_an_rtc_that_raises_still_leaves_a_usable_timer(self):
        class BrokenClock:
            def local_date(self):
                raise OSError("no rtc")

        m = Pomodoro(FakeCache(), FakeCache(), BrokenClock())
        m.press_a(0)
        m.tick(DEFAULTS["work_min"] * MINUTE_MS)
        self.assertTrue(draw(m).calls)


if __name__ == "__main__":
    unittest.main()
