import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "badge-sdk"))

from notifier import (
    POMODORO_DEFAULTS,
    STATE_LOADING,
    STATE_WAITING,
    Notifier,
)


class FakeCache:
    """Stands in for sb.store.Cache. Records every save so a test can count."""

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


def payload(pages=None, server_time="2026-08-22T10:14:00Z"):
    return {
        "v": 1,
        "server_time": server_time,
        "poll_interval_ms": 30000,
        "pages": pages
        if pages is not None
        else [
            {"slug": "next_thing", "state": "ok", "age_ms": 0, "data": {}},
            {"slug": "deploys", "state": "ok", "age_ms": 0, "data": {}},
        ],
        "pomodoro": dict(POMODORO_DEFAULTS),
    }


def machine(fetch=None, cache=None, pomodoro_cache=None, known=("next_thing", "deploys")):
    return Notifier(
        fetch or (lambda power=None: payload()),
        cache=cache or FakeCache(),
        pomodoro_cache=pomodoro_cache or FakeCache(),
        known_slugs=known,
    )


class TestRestart(unittest.TestCase):
    def test_a_restart_with_a_cached_payload_goes_back_to_loading(self):
        cache = FakeCache({"payload": payload(), "page_index": 0})
        m = machine(cache=cache)
        m.no_network(1000)
        m.restart(2000)
        self.assertEqual(m.state, STATE_LOADING)

    def test_a_restart_with_nothing_cached_goes_back_to_waiting(self):
        m = machine()
        m.no_network(1000)
        m.restart(2000)
        self.assertEqual(m.state, STATE_WAITING)

    def test_a_restart_clears_the_message_from_the_last_failure(self):
        m = machine()
        m.no_network(1000)
        self.assertEqual(m.message, "No network")
        m.restart(2000)
        self.assertIsNone(m.message)


class TestPowerOnATick(unittest.TestCase):
    def test_a_tick_that_carries_a_power_reading_updates_the_label(self):
        m = machine()
        m.load(1000, {"charging": False, "battery_v": 3.94})
        m.tick(2000, {"charging": True, "battery_v": 4.11})
        self.assertEqual(m.power_label, "USB")

    def test_a_tick_without_a_power_reading_keeps_the_last_label(self):
        m = machine()
        m.load(1000, {"charging": True, "battery_v": 4.11})
        m.tick(2000, None)
        self.assertEqual(m.power_label, "USB")

    def test_power_is_empty_when_the_battery_reading_is_missing(self):
        m = machine()
        m.load(1000, {"charging": False})
        self.assertIsNone(m.power_label)

    def test_power_is_empty_when_the_battery_reading_is_not_a_number(self):
        m = machine()
        m.load(1000, {"charging": False, "battery_v": "flat"})
        self.assertIsNone(m.power_label)


class TestServerClock(unittest.TestCase):
    def test_a_timestamp_that_stops_before_the_minutes_leaves_the_clock_empty(self):
        m = machine(lambda power=None: payload(server_time="2026-08-22T10"))
        m.load(1000, None)
        self.assertIsNone(m.clock)

    def test_a_timestamp_whose_hours_are_not_digits_leaves_the_clock_empty(self):
        m = machine(lambda power=None: payload(server_time="2026-08-22Txx:yy"))
        m.load(1000, None)
        self.assertIsNone(m.clock)


class TestSavedIndex(unittest.TestCase):
    def test_a_cached_payload_of_pages_this_build_cannot_draw_starts_at_zero(self):
        cache = FakeCache(
            {"payload": payload(pages=[{"slug": "weather", "state": "ok"}]), "page_index": 3}
        )
        m = machine(cache=cache)
        self.assertEqual(m.page_index, 0)
        self.assertEqual(m.slugs, [])
        self.assertIsNone(m.current_slug)

    def test_a_saved_index_that_is_not_a_number_falls_back_to_the_first_page(self):
        cache = FakeCache({"payload": payload(), "page_index": "two"})
        m = machine(cache=cache)
        self.assertEqual(m.page_index, 0)
        self.assertEqual(m.current_slug, "next_thing")


if __name__ == "__main__":
    unittest.main()
