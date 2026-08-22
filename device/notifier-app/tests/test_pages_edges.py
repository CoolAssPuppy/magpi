import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "badge-sdk"))

from testing import blocks, fakes  # noqa: F401  (installs the firmware fakes)

import pages
from sb import ui


def draw(module, data, state="ok", now_ms=0):
    screen = fakes.FakeScreen()
    module.draw(
        pages.Ctx(
            screen=screen,
            shape=fakes.FakeShape(),
            palette=ui.Palette(fakes.FakeColor()),
            data=data,
            state=state,
            age_ms=0,
            now_ms=now_ms,
        )
    )
    return screen


def texts(screen):
    return [call[1] for call in screen.calls if call[0] == "text"]


def rects(screen):
    return [
        call[1]
        for call in screen.calls
        if call[0] == "shape" and isinstance(call[1], tuple) and call[1][0] == "rect"
    ]


class RecordingMachine:
    """Stands in for the Notifier. A page's action reaches only these two."""

    def __init__(self):
        self.cycled = []
        self.toggled = []

    def cycle_selection(self, now_ms):
        self.cycled.append(now_ms)

    def toggle_expanded(self, now_ms):
        self.toggled.append(now_ms)


class TestNextThingEdges(unittest.TestCase):
    EVENT = {
        "title": "Platform review",
        "start": "09:54",
        "end": "10:30",
        "minutes_until": 12,
    }

    def test_a_is_the_button_that_toggles_the_rest_of_the_day(self):
        m = RecordingMachine()
        pages.next_thing.on_a(m, 1100)
        self.assertEqual(m.toggled, [1100])

    def test_an_all_day_event_says_so_instead_of_counting_minutes(self):
        screen = draw(pages.next_thing, dict(self.EVENT, all_day=True))
        self.assertTrue(blocks.drew_block_text(screen, "ALL DAY"))

    def test_an_all_day_event_does_not_count_down(self):
        screen = draw(pages.next_thing, dict(self.EVENT, all_day=True))
        self.assertNotIn("MIN", texts(screen))

    def test_the_conferencing_link_joins_the_meta_line(self):
        screen = draw(pages.next_thing, dict(self.EVENT, conferencing="Zoom"))
        self.assertIn("09:54 - 10:30 - Zoom", texts(screen))

    def test_the_hint_counts_how_many_more_things_are_queued(self):
        screen = draw(pages.next_thing, dict(self.EVENT, more=["Standup", "1:1"]))
        self.assertIn("A: NEXT 2", texts(screen))

    def test_nothing_queued_draws_no_hint(self):
        screen = draw(pages.next_thing, self.EVENT)
        self.assertFalse([t for t in texts(screen) if t.startswith("A: NEXT")])


class TestDayShapeEdges(unittest.TestCase):
    DAY = {
        "blocks": [0, 0, 1, 3, 3, 0, 1, 3, 0, 0, 2, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        "current_hour": 12,
        "free_minutes": 200,
        "meeting_count": 4,
    }

    def test_a_is_the_button_that_swaps_today_for_tomorrow(self):
        m = RecordingMachine()
        pages.day_shape.on_a(m, 1100)
        self.assertEqual(m.toggled, [1100])

    def test_whole_hours_of_free_time_are_spelled_without_the_minutes(self):
        screen = draw(pages.day_shape, dict(self.DAY, free_minutes=120))
        self.assertIn("2h free", texts(screen))

    def test_less_than_an_hour_free_is_spelled_in_minutes(self):
        screen = draw(pages.day_shape, dict(self.DAY, free_minutes=45))
        self.assertIn("45m free", texts(screen))


class TestDeploysEdges(unittest.TestCase):
    def test_a_is_the_button_that_cycles_the_expanded_project(self):
        m = RecordingMachine()
        pages.deploys.on_a(m, 1100)
        self.assertEqual(m.cycled, [1100])

    def test_a_state_this_build_does_not_know_reads_as_ready(self):
        screen = draw(pages.deploys, {"projects": [{"name": "magpi-web", "state": "SHRUG"}]})
        self.assertTrue(blocks.drew_block_text(screen, "READY"))

    def test_a_state_this_build_does_not_know_counts_for_nothing_in_the_band(self):
        screen = draw(pages.deploys, {"projects": [{"name": "magpi-web", "state": "SHRUG"}]})
        self.assertIn("0 OF 1", texts(screen))

    def test_an_expanded_index_that_is_not_a_number_expands_the_first_project(self):
        data = {
            "projects": [
                {"name": "magpi-web", "state": "READY", "commit": "bump the deps"},
                {"name": "magpi-docs", "state": "READY", "commit": "fix a typo"},
            ],
            "expanded": "second",
        }
        screen = draw(pages.deploys, data)
        self.assertIn("bump the deps", texts(screen))
        self.assertNotIn("fix a typo", texts(screen))

    def test_a_canceled_deploy_draws_its_own_band(self):
        screen = draw(pages.deploys, {"projects": [{"name": "magpi-web", "state": "CANCELED"}]})
        self.assertTrue(blocks.drew_block_text(screen, "CANCELED"))

    def test_a_deploy_older_than_a_day_is_aged_in_days(self):
        data = {"projects": [{"name": "magpi-web", "state": "READY", "age_ms": 172800000}]}
        screen = draw(pages.deploys, data)
        self.assertIn("READY 2d", texts(screen))

    def test_an_age_the_provider_left_out_drops_off_the_row(self):
        screen = draw(pages.deploys, {"projects": [{"name": "magpi-web", "state": "READY"}]})
        self.assertIn("READY ", texts(screen))


class TestCountersEdges(unittest.TestCase):
    COUNTERS = {
        "counters": [
            {"label": "Gmail", "value": 14, "delta": 3, "recent": "Re: storage quota bump"},
            {"label": "Linear", "value": 7, "delta": 0, "recent": "Fix the preview drift"},
        ]
    }

    def test_a_is_the_button_that_cycles_the_recent_line(self):
        m = RecordingMachine()
        pages.counters.on_a(m, 1100)
        self.assertEqual(m.cycled, [1100])

    def test_a_selection_that_is_not_a_number_falls_back_to_the_first_counter(self):
        screen = draw(pages.counters, dict(self.COUNTERS, selected="second"))
        self.assertIn("Re: storage quota bump", texts(screen))
        self.assertNotIn("Fix the preview drift", texts(screen))


class TestOneNumberEdges(unittest.TestCase):
    NUMBER = {
        "label": "Weekly active",
        "value": 8412,
        "spark": list(range(30)),
        "source": "PostHog",
        "updated": "4m ago",
    }

    def test_a_number_with_no_change_to_report_draws_no_percentage(self):
        screen = draw(pages.one_number, self.NUMBER)
        self.assertFalse([t for t in texts(screen) if t.endswith("%")])

    def test_a_change_that_is_not_a_number_draws_no_percentage(self):
        screen = draw(pages.one_number, dict(self.NUMBER, delta_pct="lots"))
        self.assertFalse([t for t in texts(screen) if t.endswith("%")])
        self.assertTrue(blocks.drew_block_text(screen, "8412"))

    def test_a_value_that_is_not_a_number_is_drawn_as_it_arrived(self):
        screen = draw(pages.one_number, dict(self.NUMBER, value="many"))
        self.assertTrue(blocks.drew_block_text(screen, "many"))

    def test_a_number_with_no_history_draws_the_value_and_no_bars(self):
        without = dict(self.NUMBER)
        without.pop("spark")
        screen = draw(pages.one_number, without)
        self.assertTrue(blocks.drew_block_text(screen, "8412"))

    def test_a_history_that_is_not_a_list_draws_no_bars(self):
        junk = draw(pages.one_number, dict(self.NUMBER, spark="nope"))
        without = dict(self.NUMBER)
        without.pop("spark")
        self.assertEqual(len(rects(junk)), len(rects(draw(pages.one_number, without))))

    def test_a_point_that_is_not_a_number_is_skipped_rather_than_drawn(self):
        with_junk = draw(pages.one_number, dict(self.NUMBER, spark=[1, "x", 3]))
        without_junk = draw(pages.one_number, dict(self.NUMBER, spark=[1, 3]))
        self.assertEqual(len(rects(with_junk)), len(rects(without_junk)))


if __name__ == "__main__":
    unittest.main()
