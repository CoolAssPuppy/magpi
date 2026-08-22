import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "badge-sdk"))

from pomodoro import (
    ABANDON_HOLD_MS,
    DEFAULTS,
    STATE_ABANDON_CONFIRM,
    STATE_IDLE,
    STATE_LONG_BREAK,
    STATE_SET_DONE,
    STATE_SHORT_BREAK,
    STATE_WORK,
    Pomodoro,
    clean_settings,
)

MINUTE_MS = 60000


class FakeCache:
    def __init__(self, initial=None):
        self.value = initial
        self.saves = []

    def load(self, default=None, clean=None):
        if self.value is None:
            return default() if callable(default) else default
        return self.value

    def save(self, value, clean=None):
        self.value = value
        self.saves.append(value)
        return True

    def forget(self):
        self.value = None
        return True


class FakeClock:
    """Stands in for rtc. Local date only; that is all the tally needs."""

    def __init__(self, day="2026-08-22"):
        self.day = day

    def local_date(self):
        return self.day


def machine(settings=None, log=None, clock=None):
    return Pomodoro(
        settings_cache=FakeCache(settings),
        log_cache=log or FakeCache(),
        clock=clock or FakeClock(),
    )


def run_to(m, at_minutes):
    """Advance the clock to `at_minutes` from the start and tick once."""
    now = at_minutes * MINUTE_MS
    m.tick(now)
    return now


class TestSettings(unittest.TestCase):
    def test_a_missing_file_uses_the_defaults_and_still_works(self):
        m = machine(settings=None)
        self.assertEqual(m.settings, DEFAULTS)

    def test_settings_written_by_notifier_are_used(self):
        m = machine(settings={"work_min": 50, "short_min": 10, "long_min": 30, "sessions": 3,
                              "leds": False})
        self.assertEqual(m.settings["work_min"], 50)
        self.assertEqual(m.settings["sessions"], 3)

    def test_a_partial_file_is_filled_in_from_the_defaults(self):
        m = machine(settings={"work_min": 50})
        self.assertEqual(m.settings["work_min"], 50)
        self.assertEqual(m.settings["short_min"], DEFAULTS["short_min"])

    def test_a_junk_file_falls_back_rather_than_raising(self):
        self.assertEqual(clean_settings("not a dict"), DEFAULTS)
        self.assertEqual(clean_settings({"work_min": "fifty"})["work_min"], DEFAULTS["work_min"])

    def test_an_absurd_length_is_clamped(self):
        self.assertEqual(clean_settings({"work_min": 0})["work_min"], 1)
        self.assertEqual(clean_settings({"work_min": 9999})["work_min"], 120)


class TestTheTechnique(unittest.TestCase):
    def test_it_opens_idle(self):
        self.assertEqual(machine().state, STATE_IDLE)

    def test_a_starts_the_work_phase(self):
        m = machine()
        m.press_a(1000)
        self.assertEqual(m.state, STATE_WORK)

    def test_there_is_no_pause_button(self):
        # A pomodoro is indivisible. Interrupted means void.
        self.assertFalse(hasattr(machine(), "pause"))

    def test_work_ending_advances_to_the_break_on_its_own(self):
        # The technique says rest immediately, so this is not a decision.
        m = machine()
        m.press_a(0)
        run_to(m, DEFAULTS["work_min"])
        self.assertEqual(m.state, STATE_SHORT_BREAK)

    def test_a_break_ending_waits_for_a(self):
        # Starting the next pomodoro is a decision you make.
        m = machine()
        m.press_a(0)
        run_to(m, DEFAULTS["work_min"])
        run_to(m, DEFAULTS["work_min"] + DEFAULTS["short_min"])
        self.assertEqual(m.state, STATE_SHORT_BREAK)
        self.assertEqual(m.remaining_ms, 0)

    def test_a_after_a_finished_break_starts_the_next_pomodoro(self):
        m = machine()
        m.press_a(0)
        run_to(m, DEFAULTS["work_min"])
        now = run_to(m, DEFAULTS["work_min"] + DEFAULTS["short_min"])
        m.press_a(now)
        self.assertEqual(m.state, STATE_WORK)
        self.assertEqual(m.completed_in_set, 1)

    def test_a_during_work_does_nothing(self):
        m = machine()
        m.press_a(0)
        m.press_a(1000)
        self.assertEqual(m.state, STATE_WORK)
        self.assertEqual(m.remaining_ms, DEFAULTS["work_min"] * MINUTE_MS - 1000)


class TestASetOfFour(unittest.TestCase):
    def run_set(self, m, stop_after=None):
        """Work every pomodoro of a set, waiting out each short break.

        Returns the minute the last phase ended at, so a caller can carry on.
        """
        m.press_a(0)
        elapsed = 0
        for index in range(DEFAULTS["sessions"]):
            elapsed += DEFAULTS["work_min"]
            run_to(m, elapsed)
            if stop_after is not None and index == stop_after:
                return elapsed
            if index < DEFAULTS["sessions"] - 1:
                self.assertEqual(m.state, STATE_SHORT_BREAK, "pomodoro %d" % (index + 1))
                elapsed += DEFAULTS["short_min"]
                now = run_to(m, elapsed)
                m.press_a(now)
        return elapsed

    def test_the_long_break_comes_after_the_fourth(self):
        m = machine()
        self.run_set(m)
        self.assertEqual(m.state, STATE_LONG_BREAK)

    def test_the_long_break_ending_reports_the_set_done(self):
        m = machine()
        elapsed = self.run_set(m)
        run_to(m, elapsed + DEFAULTS["long_min"])
        self.assertEqual(m.state, STATE_SET_DONE)
        self.assertEqual(m.completed_in_set, DEFAULTS["sessions"])

    def test_a_after_a_finished_set_starts_a_new_one(self):
        m = machine()
        m._state = STATE_SET_DONE
        m._completed_in_set = DEFAULTS["sessions"]
        m.press_a(1000)
        self.assertEqual(m.state, STATE_WORK)
        self.assertEqual(m.completed_in_set, 0)


class TestAbandon(unittest.TestCase):
    def test_a_pin_held_from_the_first_frame_never_fires(self):
        # held() is a firmware reading. A stuck-high pin must not void a
        # pomodoro, so the gesture arms on a release first.
        m = machine()
        m.press_a(0)
        m.hold_c(0, True)
        m.hold_c(ABANDON_HOLD_MS * 3, True)
        self.assertEqual(m.state, STATE_WORK)

    def test_the_hold_arms_on_a_release_and_fires_at_the_threshold(self):
        m = machine()
        m.press_a(0)
        m.hold_c(0, False)
        m.hold_c(100, True)
        self.assertEqual(m.state, STATE_ABANDON_CONFIRM)
        m.hold_c(100 + ABANDON_HOLD_MS, True)
        self.assertEqual(m.state, STATE_IDLE)

    def test_letting_go_early_keeps_the_pomodoro(self):
        m = machine()
        m.press_a(0)
        m.hold_c(0, False)
        m.hold_c(100, True)
        m.hold_c(600, False)
        self.assertEqual(m.state, STATE_WORK)

    def test_the_hold_reports_its_progress_for_the_whole_hold(self):
        m = machine()
        m.press_a(0)
        m.hold_c(0, False)
        m.hold_c(100, True)
        self.assertAlmostEqual(m.hold_progress, 0.0, places=2)
        m.hold_c(100 + ABANDON_HOLD_MS // 2, True)
        self.assertAlmostEqual(m.hold_progress, 0.5, places=1)

    def test_an_abandoned_pomodoro_does_not_count(self):
        m = machine()
        m.press_a(0)
        m.hold_c(0, False)
        m.hold_c(100, True)
        m.hold_c(100 + ABANDON_HOLD_MS, True)
        self.assertEqual(m.completed_today, 0)
        self.assertEqual(m.completed_in_set, 0)

    def test_abandoning_does_not_touch_pomodoros_already_banked(self):
        m = machine()
        m.press_a(0)
        run_to(m, DEFAULTS["work_min"])
        now = run_to(m, DEFAULTS["work_min"] + DEFAULTS["short_min"])
        m.press_a(now)
        m.hold_c(now, False)
        m.hold_c(now + 100, True)
        m.hold_c(now + 100 + ABANDON_HOLD_MS, True)
        self.assertEqual(m.completed_today, 1)

    def test_c_does_nothing_while_idle(self):
        m = machine()
        m.hold_c(0, False)
        m.hold_c(100, True)
        self.assertEqual(m.state, STATE_IDLE)


class TestAdjustingTheLength(unittest.TestCase):
    def test_up_and_down_move_the_work_length_while_idle(self):
        m = machine()
        m.press_up(1000)
        self.assertEqual(m.settings["work_min"], DEFAULTS["work_min"] + 5)
        m.press_down(1100)
        m.press_down(1200)
        self.assertEqual(m.settings["work_min"], DEFAULTS["work_min"] - 5)

    def test_the_length_cannot_go_below_a_minute_or_past_two_hours(self):
        m = machine(settings={"work_min": 5})
        for _ in range(5):
            m.press_down(1000)
        self.assertEqual(m.settings["work_min"], 1)
        m = machine(settings={"work_min": 118})
        for _ in range(5):
            m.press_up(1000)
        self.assertEqual(m.settings["work_min"], 120)

    def test_the_length_is_fixed_once_a_pomodoro_is_running(self):
        m = machine()
        m.press_a(0)
        m.press_up(1000)
        self.assertEqual(m.settings["work_min"], DEFAULTS["work_min"])


class TestLeds(unittest.TestCase):
    def test_the_leds_are_dark_while_idle(self):
        self.assertEqual(machine().leds(0), (0.0,) * 4)

    def test_the_leds_are_dark_for_most_of_the_work_phase(self):
        m = machine()
        m.press_a(0)
        m.tick(60000)
        self.assertEqual(m.leds(60000), (0.0,) * 4)

    def test_the_ramp_starts_at_exactly_sixty_seconds_remaining(self):
        m = machine()
        m.press_a(0)
        just_before = DEFAULTS["work_min"] * MINUTE_MS - 60001
        m.tick(just_before)
        self.assertEqual(m.leds(just_before), (0.0,) * 4)

        at_sixty = DEFAULTS["work_min"] * MINUTE_MS - 60000
        m.tick(at_sixty)
        self.assertEqual(m.leds(at_sixty), (0.0,) * 4)

        halfway = DEFAULTS["work_min"] * MINUTE_MS - 30000
        m.tick(halfway)
        self.assertAlmostEqual(m.leds(halfway)[0], 0.5, places=1)

    def test_the_ramp_reaches_full_as_the_phase_ends(self):
        m = machine()
        m.press_a(0)
        at_end = DEFAULTS["work_min"] * MINUTE_MS - 1
        m.tick(at_end)
        self.assertGreater(m.leds(at_end)[0], 0.98)

    def test_a_break_breathes_rather_than_ramping(self):
        m = machine()
        m.press_a(0)
        now = run_to(m, DEFAULTS["work_min"])
        self.assertNotEqual(m.leds(now), m.leds(now + 1000))

    def test_the_leds_setting_is_respected(self):
        m = machine(settings={"leds": False})
        m.press_a(0)
        at_end = DEFAULTS["work_min"] * MINUTE_MS - 1
        m.tick(at_end)
        self.assertEqual(m.leds(at_end), (0.0,) * 4)


class TestTheDailyTally(unittest.TestCase):
    def test_a_completed_pomodoro_is_banked(self):
        log = FakeCache()
        m = machine(log=log)
        m.press_a(0)
        run_to(m, DEFAULTS["work_min"])
        self.assertEqual(m.completed_today, 1)
        self.assertEqual(log.value["count"], 1)

    def test_the_tally_rolls_over_at_local_midnight(self):
        clock = FakeClock("2026-08-23")
        log = FakeCache({"day": "2026-08-22", "count": 6})
        m = machine(log=log, clock=clock)
        self.assertEqual(m.completed_today, 0)

    def test_a_tally_from_the_same_day_is_kept(self):
        clock = FakeClock("2026-08-22")
        log = FakeCache({"day": "2026-08-22", "count": 6})
        m = machine(log=log, clock=clock)
        self.assertEqual(m.completed_today, 6)

    def test_a_corrupt_log_starts_the_day_at_zero(self):
        m = machine(log=FakeCache({"day": 5, "count": "six"}))
        self.assertEqual(m.completed_today, 0)

    def test_a_clock_that_cannot_answer_still_counts_this_session(self):
        class BrokenClock:
            def local_date(self):
                raise OSError("no rtc")

        m = machine(clock=BrokenClock())
        m.press_a(0)
        run_to(m, DEFAULTS["work_min"])
        self.assertEqual(m.completed_today, 1)


class TestDisplay(unittest.TestCase):
    def test_the_clock_reads_mm_ss(self):
        m = machine()
        m.press_a(0)
        m.tick(0)
        self.assertEqual(m.clock_text, "25:00")

    def test_the_clock_counts_down(self):
        m = machine()
        m.press_a(0)
        m.tick(18000)
        self.assertEqual(m.clock_text, "24:42")

    def test_an_idle_clock_shows_the_length_that_would_start(self):
        self.assertEqual(machine().clock_text, "25:00")

    def test_the_phase_label_names_the_state(self):
        m = machine()
        self.assertEqual(m.phase_label, "READY")
        m.press_a(0)
        self.assertEqual(m.phase_label, "WORK")

    def test_the_set_dots_fill_as_pomodoros_complete(self):
        m = machine()
        self.assertEqual(m.set_dots, [0, 0, 0, 0])
        m.press_a(0)
        self.assertEqual(m.set_dots, [2, 0, 0, 0])
        run_to(m, DEFAULTS["work_min"])
        self.assertEqual(m.set_dots, [1, 0, 0, 0])

    def test_the_dots_match_a_shorter_set(self):
        m = machine(settings={"sessions": 3})
        self.assertEqual(len(m.set_dots), 3)


if __name__ == "__main__":
    unittest.main()
