import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "badge-sdk"))

from notifier import (
    POMODORO_DEFAULTS,
    STATE_BUSY,
    STATE_LOADING,
    STATE_OFFLINE,
    STATE_READY,
    STATE_STALE,
    STATE_UNPAIRED,
    STATE_WAITING,
    Notifier,
    Unpaired,
    Unreachable,
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


def payload(pages=None, poll_interval_ms=30000, pomodoro=None):
    return {
        "v": 1,
        "server_time": "2026-08-22T10:14:00Z",
        "poll_interval_ms": poll_interval_ms,
        "pages": pages
        if pages is not None
        else [
            {"slug": "next_thing", "state": "ok", "age_ms": 0, "data": {}},
            {"slug": "deploys", "state": "ok", "age_ms": 0, "data": {}},
        ],
        "pomodoro": pomodoro if pomodoro is not None else dict(POMODORO_DEFAULTS),
    }


def machine(fetch=None, cache=None, pomodoro_cache=None, known=("next_thing", "deploys")):
    return Notifier(
        fetch or (lambda power=None: payload()),
        cache=cache or FakeCache(),
        pomodoro_cache=pomodoro_cache or FakeCache(),
        known_slugs=known,
    )


class TestLifecycle(unittest.TestCase):
    def test_starts_waiting_for_the_radio(self):
        self.assertEqual(machine().state, STATE_WAITING)

    def test_waiting_for_network_holds_the_waiting_state(self):
        m = machine()
        m.waiting_for_network()
        self.assertEqual(m.state, STATE_WAITING)

    def test_load_reaches_ready(self):
        m = machine()
        m.load(1000, None)
        self.assertEqual(m.state, STATE_READY)

    def test_a_dead_token_reaches_unpaired_so_the_runtime_opens_pairing(self):
        def fetch(power=None):
            raise Unpaired("no token")

        m = machine(fetch)
        m.load(1000, None)
        self.assertEqual(m.state, STATE_UNPAIRED)

    def test_a_failed_first_fetch_with_no_cache_is_offline(self):
        def fetch(power=None):
            raise Unreachable("radio dropped")

        m = machine(fetch)
        m.load(1000, None)
        self.assertEqual(m.state, STATE_OFFLINE)

    def test_no_network_reports_offline(self):
        m = machine()
        m.no_network(1000)
        self.assertEqual(m.state, STATE_OFFLINE)

    def test_a_rate_limit_is_busy_rather_than_offline(self):
        def fetch(power=None):
            raise Unreachable("slow down", retry_after=30)

        m = machine(fetch)
        m.load(1000, None)
        self.assertEqual(m.state, STATE_BUSY)


class TestCachedPayload(unittest.TestCase):
    def test_a_cached_payload_is_drawn_before_the_first_fetch_returns(self):
        cache = FakeCache({"payload": payload(), "page_index": 0})
        m = machine(cache=cache)
        self.assertIsNotNone(m.payload)
        self.assertEqual(m.state, STATE_LOADING)

    def test_a_failed_fetch_over_a_cached_payload_is_stale_rather_than_offline(self):
        def fetch(power=None):
            raise Unreachable("radio dropped")

        cache = FakeCache({"payload": payload(), "page_index": 0})
        m = machine(fetch, cache=cache)
        m.load(1000, None)
        self.assertEqual(m.state, STATE_STALE)
        self.assertIsNotNone(m.payload)

    def test_the_current_page_index_survives_a_reset(self):
        cache = FakeCache({"payload": payload(), "page_index": 1})
        m = machine(cache=cache)
        self.assertEqual(m.page_index, 1)
        self.assertEqual(m.current_slug, "deploys")

    def test_a_saved_index_past_the_end_falls_back_to_the_first_page(self):
        cache = FakeCache({"payload": payload(), "page_index": 9})
        m = machine(cache=cache)
        self.assertEqual(m.page_index, 0)

    def test_a_good_fetch_writes_the_payload_and_the_index(self):
        cache = FakeCache()
        m = machine(cache=cache)
        m.load(1000, None)
        self.assertEqual(cache.value["payload"]["v"], 1)
        self.assertEqual(cache.value["page_index"], 0)

    def test_a_corrupt_cache_file_starts_fresh_rather_than_raising(self):
        cache = FakeCache({"payload": "not a dict", "page_index": "x"})
        m = machine(cache=cache)
        self.assertIsNone(m.payload)
        self.assertEqual(m.page_index, 0)


class TestPages(unittest.TestCase):
    def test_the_order_comes_from_the_payload_not_the_device(self):
        m = machine(lambda power=None: payload(
            pages=[
                {"slug": "deploys", "state": "ok"},
                {"slug": "next_thing", "state": "ok"},
            ]
        ))
        m.load(1000, None)
        self.assertEqual(m.slugs, ["deploys", "next_thing"])

    def test_a_slug_the_device_does_not_recognise_is_skipped_not_fatal(self):
        m = machine(lambda power=None: payload(
            pages=[
                {"slug": "next_thing", "state": "ok"},
                {"slug": "weather", "state": "ok"},
                {"slug": "deploys", "state": "ok"},
            ]
        ))
        m.load(1000, None)
        self.assertEqual(m.state, STATE_READY)
        self.assertEqual(m.slugs, ["next_thing", "deploys"])

    def test_down_moves_to_the_next_page_and_wraps(self):
        m = machine()
        m.load(1000, None)
        m.next_page(1100)
        self.assertEqual(m.current_slug, "deploys")
        m.next_page(1200)
        self.assertEqual(m.current_slug, "next_thing")

    def test_up_moves_to_the_previous_page_and_wraps(self):
        m = machine()
        m.load(1000, None)
        m.previous_page(1100)
        self.assertEqual(m.current_slug, "deploys")

    def test_paging_persists_the_new_index(self):
        cache = FakeCache()
        m = machine(cache=cache)
        m.load(1000, None)
        m.next_page(1100)
        self.assertEqual(cache.value["page_index"], 1)

    def test_paging_with_no_pages_configured_does_nothing(self):
        m = machine(lambda power=None: payload(pages=[]))
        m.load(1000, None)
        m.next_page(1100)
        self.assertIsNone(m.current_slug)

    def test_the_current_page_carries_its_own_state_and_data(self):
        m = machine(lambda power=None: payload(
            pages=[{"slug": "next_thing", "state": "error", "message": "Google said no"}]
        ))
        m.load(1000, None)
        self.assertEqual(m.current_page["state"], "error")
        self.assertEqual(m.current_page["message"], "Google said no")


class TestPomodoroHandoff(unittest.TestCase):
    def test_the_pomodoro_block_is_written_on_the_first_poll(self):
        pomodoro = FakeCache()
        m = machine(pomodoro_cache=pomodoro)
        m.load(1000, None)
        self.assertEqual(len(pomodoro.saves), 1)
        self.assertEqual(pomodoro.value["work_min"], POMODORO_DEFAULTS["work_min"])

    def test_an_unchanged_block_is_not_rewritten(self):
        # This runs every poll. Rewriting an unchanged file every thirty
        # seconds for months is avoidable flash wear.
        pomodoro = FakeCache()
        m = machine(pomodoro_cache=pomodoro)
        m.load(1000, None)
        m.load(31000, None)
        m.load(61000, None)
        self.assertEqual(len(pomodoro.saves), 1)

    def test_a_changed_block_is_written_again(self):
        settings = [dict(POMODORO_DEFAULTS), dict(POMODORO_DEFAULTS, work_min=50)]

        def fetch(power=None):
            return payload(pomodoro=settings.pop(0) if settings else None)

        pomodoro = FakeCache()
        m = machine(fetch, pomodoro_cache=pomodoro)
        m.load(1000, None)
        m.load(31000, None)
        self.assertEqual(len(pomodoro.saves), 2)
        self.assertEqual(pomodoro.value["work_min"], 50)

    def test_a_payload_with_no_pomodoro_block_leaves_the_file_alone(self):
        pomodoro = FakeCache({"work_min": 25})
        m = machine(lambda power=None: payload(pomodoro={}), pomodoro_cache=pomodoro)
        m.load(1000, None)
        self.assertEqual(pomodoro.saves, [])

    def test_a_partial_block_is_filled_in_from_the_defaults(self):
        pomodoro = FakeCache()
        m = machine(lambda power=None: payload(pomodoro={"work_min": 50}), pomodoro_cache=pomodoro)
        m.load(1000, None)
        self.assertEqual(pomodoro.value["work_min"], 50)
        self.assertEqual(pomodoro.value["short_min"], POMODORO_DEFAULTS["short_min"])


class TestAge(unittest.TestCase):
    def test_age_is_zero_at_the_moment_of_the_fetch(self):
        m = machine()
        m.load(1000, None)
        self.assertEqual(m.age_ms(1000), 0)

    def test_age_grows_with_the_clock(self):
        m = machine()
        m.load(1000, None)
        self.assertEqual(m.age_ms(31000), 30000)

    def test_a_payload_that_never_arrived_has_no_age(self):
        self.assertIsNone(machine().age_ms(1000))

    def test_a_clock_that_wrapped_reports_zero_rather_than_a_negative_age(self):
        # badge.ticks is a wrapping millisecond counter, not a real clock.
        m = machine()
        m.load(1000, None)
        self.assertEqual(m.age_ms(500), 0)


class TestPollInterval(unittest.TestCase):
    def test_the_interval_comes_from_the_payload(self):
        m = machine(lambda power=None: payload(poll_interval_ms=60000))
        m.load(1000, None)
        self.assertEqual(m.poll_interval_ms, 60000)

    def test_an_interval_below_the_floor_is_raised_to_it(self):
        m = machine(lambda power=None: payload(poll_interval_ms=100))
        m.load(1000, None)
        self.assertEqual(m.poll_interval_ms, 5000)

    def test_a_missing_interval_uses_the_default(self):
        m = machine(lambda power=None: payload(poll_interval_ms=None))
        m.load(1000, None)
        self.assertEqual(m.poll_interval_ms, 30000)


if __name__ == "__main__":
    unittest.main()


class TestViewState(unittest.TestCase):
    def test_a_pages_selection_starts_at_zero(self):
        m = machine()
        m.load(1000, None)
        self.assertEqual(m.page_view_state("next_thing"), {"expanded": 0, "selected": 0})

    def test_cycling_advances_the_current_pages_selection(self):
        m = machine()
        m.load(1000, None)
        m.cycle_selection(1100)
        self.assertEqual(m.page_view_state("next_thing")["selected"], 1)

    def test_toggling_flips_the_current_pages_expanded_flag(self):
        m = machine()
        m.load(1000, None)
        m.toggle_expanded(1100)
        self.assertEqual(m.page_view_state("next_thing")["expanded"], 1)
        m.toggle_expanded(1200)
        self.assertEqual(m.page_view_state("next_thing")["expanded"], 0)

    def test_each_page_keeps_its_own_selection(self):
        m = machine()
        m.load(1000, None)
        m.cycle_selection(1100)
        m.next_page(1200)
        self.assertEqual(m.page_view_state("deploys")["selected"], 0)
        self.assertEqual(m.page_view_state("next_thing")["selected"], 1)

    def test_a_page_action_with_nothing_configured_does_nothing(self):
        m = machine(lambda power=None: payload(pages=[]))
        m.load(1000, None)
        m.cycle_selection(1100)
        m.toggle_expanded(1200)
        self.assertIsNone(m.current_slug)


class TestStatusFields(unittest.TestCase):
    def test_now_ms_follows_the_clock(self):
        m = machine()
        m.load(1000, None)
        m.tick(4000, None)
        self.assertEqual(m.now_ms, 4000)

    def test_the_clock_comes_from_the_payloads_server_time(self):
        m = machine()
        m.load(1000, None)
        self.assertEqual(m.clock, "10:14")

    def test_an_unparseable_server_time_leaves_the_clock_empty(self):
        m = machine(lambda power=None: dict(payload(), server_time="not a time"))
        m.load(1000, None)
        self.assertIsNone(m.clock)

    def test_power_reports_usb_when_charging(self):
        m = machine()
        m.load(1000, {"charging": True, "battery_v": 4.11})
        self.assertEqual(m.power_label, "USB")

    def test_power_reports_the_voltage_on_battery(self):
        m = machine()
        m.load(1000, {"charging": False, "battery_v": 3.94})
        self.assertEqual(m.power_label, "3.9V")

    def test_power_is_empty_when_the_firmware_gave_nothing(self):
        m = machine()
        m.load(1000, None)
        self.assertIsNone(m.power_label)


class TestRefetch(unittest.TestCase):
    def test_refetch_now_resets_the_poller_clock(self):
        m = machine()
        m.load(1000, None)
        m.refetch_now(5000)
        self.assertTrue(m.wants_refetch)

    def test_the_flag_clears_once_the_fetch_ran(self):
        m = machine()
        m.refetch_now(5000)
        m.load(5000, None)
        self.assertFalse(m.wants_refetch)
