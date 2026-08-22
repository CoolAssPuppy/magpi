import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "badge-sdk"))

from testing import blocks, fakes  # noqa: F401  (installs the firmware fakes)

from notifier import STATE_LOADING, Notifier, Unpaired, Unreachable
from notifier_ui import NotifierScreen

MINUTE_MS = 60000
HOUR_MS = 3600000
POLL_MS = 30000


class FakeCache:
    def __init__(self, initial=None):
        self.value = initial

    def load(self, default=None, clean=None):
        if self.value is None:
            return default() if callable(default) else default
        return self.value

    def save(self, value, clean=None):
        self.value = value
        return True


def payload(pages=None, server_time="2026-08-22T10:14:00Z"):
    return {
        "v": 1,
        "server_time": server_time,
        "poll_interval_ms": POLL_MS,
        "pages": pages
        if pages is not None
        else [{"slug": "next_thing", "state": "ok", "age_ms": 0, "data": {"title": "Standup"}}],
    }


def machine(fetch=None, cache=None, known=("next_thing", "counters")):
    return Notifier(
        fetch or (lambda power=None: payload()),
        cache=cache or FakeCache(),
        pomodoro_cache=FakeCache(),
        known_slugs=known,
    )


def loaded(pages=None, power=None, known=("next_thing", "counters")):
    m = machine(fetch=lambda power=None: payload(pages), known=known)
    m.load(0, power=power)
    return m


def draw(m):
    screen = fakes.FakeScreen()
    NotifierScreen(screen, fakes.FakeShape(), fakes.FakeColor()).draw(m)
    return screen


def texts(screen):
    return [call[1] for call in screen.calls if call[0] == "text"]


def pen_before(screen, message):
    """The pen that was set last before `message` was drawn."""
    pen = None
    for call in screen.calls:
        if call[0] == "pen":
            pen = call[1]
        elif call[0] == "text" and call[1] == message:
            return pen
    return None


class TestJoining(unittest.TestCase):
    def test_a_badge_still_finding_the_radio_says_so(self):
        self.assertTrue(blocks.drew_block_text(draw(machine()), "JOINING WIFI"))

    def test_the_wait_is_given_a_length_so_it_does_not_look_stuck(self):
        self.assertIn("This takes about 20 seconds", texts(draw(machine())))

    def test_loading_without_a_payload_still_says_joining(self):
        m = machine()
        m.state = STATE_LOADING
        self.assertTrue(blocks.drew_block_text(draw(m), "JOINING WIFI"))

    def test_a_lifecycle_screen_is_signed_with_the_product_name(self):
        self.assertIn("MAGPI", texts(draw(machine())))


class TestOffline(unittest.TestCase):
    def test_a_badge_that_never_reached_the_server_names_the_retry_button(self):
        m = machine()
        m.no_network(0)
        screen = draw(m)
        self.assertTrue(blocks.drew_block_text(screen, "NO NETWORK"))
        self.assertIn("B retries now", texts(screen))

    def test_the_reason_the_fetch_failed_is_read_out_under_the_hint(self):
        def refuse(power=None):
            raise Unreachable("Server said 503")

        m = machine(fetch=refuse)
        m.load(0)
        self.assertIn("Server said 503", texts(draw(m)))

    def test_a_message_that_only_repeats_the_headline_is_not_drawn_twice(self):
        m = machine()
        m.no_network(0)
        self.assertNotIn("No network", texts(draw(m)))


class TestNoPages(unittest.TestCase):
    def test_a_payload_with_nothing_enabled_sends_the_wearer_to_the_website(self):
        screen = draw(loaded(pages=[]))
        self.assertTrue(blocks.drew_block_text(screen, "NO PAGES YET"))
        self.assertIn("Open magpi.to to choose pages", texts(screen))

    def test_a_badge_the_server_has_forgotten_is_not_left_on_a_black_screen(self):
        def forgotten(power=None):
            raise Unpaired("This badge is not paired")

        m = machine(fetch=forgotten)
        m.load(0)
        self.assertTrue(blocks.drew_block_text(draw(m), "NO PAGES YET"))


class TestUnknownPage(unittest.TestCase):
    """The machine filters unknown slugs, so this only happens when the
    registry and that filter disagree. It has to say so, not draw black."""

    def test_a_slug_this_build_cannot_draw_is_named_on_screen(self):
        m = loaded(
            pages=[{"slug": "weather", "state": "ok", "age_ms": 0, "data": {}}],
            known=("weather",),
        )
        screen = draw(m)
        self.assertTrue(blocks.drew_block_text(screen, "UNKNOWN PAGE"))
        self.assertIn("weather", texts(screen))

    def test_a_slug_with_no_name_to_print_draws_the_headline_alone(self):
        m = loaded(
            pages=[{"slug": "", "state": "ok", "age_ms": 0, "data": {}}],
            known=("",),
        )
        screen = draw(m)
        self.assertTrue(blocks.drew_block_text(screen, "UNKNOWN PAGE"))
        self.assertNotIn("", texts(screen))


class TestStatusBar(unittest.TestCase):
    def test_the_page_names_itself_in_the_corner(self):
        self.assertIn("NEXT", texts(draw(loaded())))

    def test_the_clock_the_server_sent_is_shown(self):
        self.assertIn("10:14", texts(draw(loaded())))

    def test_a_payload_with_no_usable_time_leaves_the_clock_blank(self):
        m = machine(fetch=lambda power=None: payload(server_time="not a timestamp"))
        m.load(0)
        self.assertIsNone(m.clock)
        self.assertIn("NEXT", texts(draw(m)))

    def test_a_stale_screen_warns_where_it_names_the_page(self):
        m = loaded()
        m.tick(POLL_MS * 4)
        palette = fakes.FakeColor()
        self.assertEqual(pen_before(draw(m), "NEXT"), palette.rgb(224, 160, 32))

    def test_a_fresh_screen_names_the_page_in_the_accent_instead(self):
        palette = fakes.FakeColor()
        self.assertEqual(pen_before(draw(loaded()), "NEXT"), palette.rgb(15, 191, 168))


class TestRightSlot(unittest.TestCase):
    """Battery and data age, the two things that explain a stale screen."""

    def test_seconds_old_data_is_counted_in_seconds(self):
        m = loaded()
        m.tick(30000)
        self.assertIn("30s", texts(draw(m)))

    def test_minutes_old_data_is_counted_in_minutes(self):
        m = loaded()
        m.tick(5 * MINUTE_MS)
        self.assertIn("5m", texts(draw(m)))

    def test_hours_old_data_is_counted_in_hours(self):
        m = loaded()
        m.tick(2 * HOUR_MS)
        self.assertIn("2h", texts(draw(m)))

    def test_a_charging_badge_says_so_beside_the_age(self):
        m = loaded(power={"charging": True})
        m.tick(0)
        self.assertIn("0s - USB", texts(draw(m)))

    def test_a_badge_on_battery_shows_the_voltage_beside_the_age(self):
        m = loaded(power={"charging": False, "battery_v": 3.94})
        m.tick(0)
        self.assertIn("0s - 3.9V", texts(draw(m)))

    def test_a_restored_payload_drawn_before_any_fetch_lands_has_no_age_to_show(self):
        saved = FakeCache({"payload": payload(), "page_index": 0})
        m = machine(cache=saved)
        screen = draw(m)
        self.assertIn("NEXT", texts(screen))
        self.assertNotIn("0s", texts(screen))


class TestPageViewState(unittest.TestCase):
    """Which item is selected is a glance the wearer chose, so it is merged
    into the page's data here rather than held in the payload."""

    def counters(self):
        return loaded(
            pages=[
                {
                    "slug": "counters",
                    "state": "ok",
                    "age_ms": 0,
                    "data": {
                        "counters": [
                            {"label": "inbox", "value": 4, "recent": "From Ana"},
                            {"label": "prs", "value": 2, "recent": "From Bo"},
                        ]
                    },
                }
            ]
        )

    def test_the_first_item_is_the_one_shown_before_anything_is_pressed(self):
        self.assertIn("From Ana", texts(draw(self.counters())))

    def test_cycling_the_selection_changes_what_the_page_draws(self):
        m = self.counters()
        m.cycle_selection(0)
        screen = draw(m)
        self.assertIn("From Bo", texts(screen))
        self.assertNotIn("From Ana", texts(screen))


if __name__ == "__main__":
    unittest.main()
