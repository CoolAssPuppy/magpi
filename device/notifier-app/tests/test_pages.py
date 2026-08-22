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


class TestRegistry(unittest.TestCase):
    def test_every_slug_in_the_shared_constants_has_a_module(self):
        from sb.constants import PAGE_SLUGS

        self.assertEqual(set(pages.KNOWN_SLUGS), set(PAGE_SLUGS))

    def test_a_slug_this_build_cannot_draw_answers_none(self):
        self.assertIsNone(pages.get("weather"))

    def test_every_module_exposes_the_page_contract(self):
        for slug, module in pages.REGISTRY.items():
            self.assertEqual(module.SLUG, slug)
            self.assertTrue(callable(module.draw))
            self.assertTrue(hasattr(module, "NAME"))

    def test_ctx_carries_nothing_beyond_the_contract(self):
        self.assertEqual(
            set(pages.Ctx.__slots__),
            {"screen", "shape", "palette", "data", "state", "age_ms", "now_ms"},
        )


class TestEveryPageDrawsEveryState(unittest.TestCase):
    """Data, empty, not connected, and error. Never a blank screen."""

    def test_no_state_draws_nothing(self):
        for slug, module in pages.REGISTRY.items():
            for state in ("ok", "empty", "not_connected", "error"):
                screen = draw(module, {}, state=state)
                self.assertTrue(
                    screen.calls,
                    "%s drew nothing in the %s state" % (slug, state),
                )


class TestNextThing(unittest.TestCase):
    EVENT = {
        "title": "Platform review with the storage team",
        "start": "09:54",
        "end": "10:30",
        "location": "MEET",
        "minutes_until": 12,
    }

    def test_the_minutes_are_the_biggest_thing_on_the_screen(self):
        screen = draw(pages.next_thing, self.EVENT)
        self.assertTrue(blocks.drew_block_text(screen, "12"))

    def test_the_title_wraps_to_two_lines(self):
        screen = draw(pages.next_thing, self.EVENT)
        title_lines = [t for t in texts(screen) if "storage" in t or "Platform" in t]
        self.assertEqual(len(title_lines), 2)

    def test_a_meeting_that_started_reads_now(self):
        screen = draw(pages.next_thing, dict(self.EVENT, minutes_until=0))
        self.assertTrue(blocks.drew_block_text(screen, "NOW"))

    def test_an_empty_calendar_says_so(self):
        screen = draw(pages.next_thing, {})
        self.assertTrue(blocks.drew_block_text(screen, "NOTHING UNTIL TOMORROW"))

    def test_the_leds_are_off_beyond_the_first_threshold(self):
        self.assertEqual(pages.next_thing.leds({"minutes_until": 40}, 0), (0.0,) * 4)

    def test_the_leds_come_up_at_fifteen_minutes(self):
        self.assertEqual(pages.next_thing.leds({"minutes_until": 15}, 0), (0.25,) * 4)

    def test_the_leds_come_up_again_at_five(self):
        self.assertEqual(pages.next_thing.leds({"minutes_until": 5}, 0), (0.5,) * 4)

    def test_the_last_minute_pulses(self):
        on = pages.next_thing.leds({"minutes_until": 0.5}, 0)
        off = pages.next_thing.leds({"minutes_until": 0.5}, 500)
        self.assertNotEqual(on, off)

    def test_the_leds_go_out_once_the_meeting_has_started(self):
        self.assertEqual(pages.next_thing.leds({"minutes_until": -3}, 0), (0.0,) * 4)

    def test_a_missing_minutes_field_costs_the_leds_not_the_app(self):
        self.assertEqual(pages.next_thing.leds({}, 0), (0.0,) * 4)


class TestDayShape(unittest.TestCase):
    DAY = {
        "blocks": [0, 0, 1, 3, 3, 0, 1, 3, 0, 0, 2, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        "current_hour": 12,
        "free_minutes": 200,
        "meeting_count": 4,
    }

    def test_the_summary_counts_the_meetings(self):
        screen = draw(pages.day_shape, self.DAY)
        self.assertIn("4 meetings", texts(screen))

    def test_the_summary_spells_the_free_time_in_hours_and_minutes(self):
        screen = draw(pages.day_shape, self.DAY)
        self.assertIn("3h 20m free", texts(screen))

    def test_one_meeting_is_not_pluralised(self):
        screen = draw(pages.day_shape, dict(self.DAY, meeting_count=1))
        self.assertIn("1 meeting", texts(screen))

    def test_a_short_block_list_draws_the_rest_as_free(self):
        screen = draw(pages.day_shape, dict(self.DAY, blocks=[3, 3]))
        self.assertTrue(screen.calls)

    def test_a_block_list_of_junk_draws_rather_than_raising(self):
        screen = draw(pages.day_shape, dict(self.DAY, blocks="not a list"))
        self.assertTrue(screen.calls)

    def test_an_empty_day_says_nothing_is_booked(self):
        screen = draw(pages.day_shape, dict(self.DAY, blocks=[0] * 24))
        self.assertIn("Nothing booked", texts(screen))

    def test_this_page_never_lights_the_leds(self):
        self.assertFalse(hasattr(pages.day_shape, "leds"))


class TestDeploys(unittest.TestCase):
    PROJECTS = {
        "projects": [
            {"name": "magpi-web", "state": "ERROR", "commit": "fix the metrics", "age_ms": 120000},
            {"name": "magpi-docs", "state": "BUILDING", "age_ms": 40000},
            {"name": "notenerds", "state": "READY", "age_ms": 10800000},
        ]
    }

    def test_the_worst_state_sets_the_band(self):
        screen = draw(pages.deploys, self.PROJECTS)
        self.assertTrue(blocks.drew_block_text(screen, "ERROR"))

    def test_building_wins_when_nothing_failed(self):
        projects = [p for p in self.PROJECTS["projects"] if p["state"] != "ERROR"]
        screen = draw(pages.deploys, {"projects": projects})
        self.assertTrue(blocks.drew_block_text(screen, "BUILDING"))

    def test_all_ready_reads_ready(self):
        screen = draw(pages.deploys, {"projects": [{"name": "a", "state": "READY"}]})
        self.assertTrue(blocks.drew_block_text(screen, "READY"))

    def test_the_expanded_project_shows_its_commit(self):
        screen = draw(pages.deploys, dict(self.PROJECTS, expanded=0))
        self.assertIn("fix the metrics", texts(screen))

    def test_a_project_that_is_not_expanded_hides_its_commit(self):
        screen = draw(pages.deploys, dict(self.PROJECTS, expanded=1))
        self.assertNotIn("fix the metrics", texts(screen))

    def test_at_most_four_projects_are_listed(self):
        many = {"projects": [{"name": "p%d" % i, "state": "READY"} for i in range(9)]}
        screen = draw(pages.deploys, many)
        names = [t for t in texts(screen) if t.startswith("p")]
        self.assertLessEqual(len(names), 4)

    def test_the_leds_are_full_on_an_error(self):
        self.assertEqual(pages.deploys.leds(self.PROJECTS, 0), (1.0,) * 4)

    def test_the_leds_pulse_while_building(self):
        projects = {"projects": [{"name": "a", "state": "BUILDING"}]}
        on = pages.deploys.leds(projects, 0)
        off = pages.deploys.leds(projects, 1000)
        self.assertNotEqual(on, off)

    def test_the_leds_are_off_when_everything_is_ready(self):
        self.assertEqual(pages.deploys.leds({"projects": [{"state": "READY"}]}, 0), (0.0,) * 4)

    def test_no_projects_says_so(self):
        screen = draw(pages.deploys, {"projects": []})
        self.assertTrue(blocks.drew_block_text(screen, "NO PROJECTS"))


class TestCounters(unittest.TestCase):
    COUNTERS = {
        "counters": [
            {"label": "Gmail", "value": 14, "delta": 3, "recent": "Re: storage quota bump"},
            {"label": "Linear", "value": 7, "delta": 0, "recent": "Fix the preview drift"},
            {"label": "Slack", "value": 2, "delta": 1, "recent": "standup in five"},
        ]
    }

    def test_every_counter_shows_its_label(self):
        screen = draw(pages.counters, self.COUNTERS)
        for label in ("GMAIL", "LINEAR", "SLACK"):
            self.assertIn(label, texts(screen))

    def test_the_selected_counter_supplies_the_recent_line(self):
        screen = draw(pages.counters, dict(self.COUNTERS, selected=1))
        self.assertIn("Fix the preview drift", texts(screen))

    def test_a_subject_longer_than_the_cap_is_cut(self):
        from sb.constants import SUBJECT_MAX

        long = {"counters": [{"label": "Gmail", "value": 1, "recent": "x" * 200}]}
        screen = draw(pages.counters, long)
        self.assertIn("x" * SUBJECT_MAX, texts(screen))

    def test_at_most_four_counters_are_drawn(self):
        from sb.constants import COUNTER_MAX

        many = {"counters": [{"label": "c%d" % i, "value": i} for i in range(9)]}
        screen = draw(pages.counters, many)
        labels = [t for t in texts(screen) if t.startswith("C")]
        self.assertLessEqual(len(labels), COUNTER_MAX)

    def test_the_leds_blink_once_when_a_count_went_up(self):
        data = dict(self.COUNTERS, changed_age_ms=0)
        self.assertEqual(pages.counters.leds(data, 0), (1.0,) * 4)

    def test_the_blink_is_over_by_the_next_poll(self):
        data = dict(self.COUNTERS, changed_age_ms=30000)
        self.assertEqual(pages.counters.leds(data, 0), (0.0,) * 4)

    def test_nothing_blinks_when_nothing_went_up(self):
        flat = {"counters": [{"label": "Gmail", "value": 14, "delta": 0}]}
        self.assertEqual(pages.counters.leds(flat, 0), (0.0,) * 4)


class TestOneNumber(unittest.TestCase):
    NUMBER = {
        "label": "Weekly active",
        "value": 8412,
        "spark": list(range(30)),
        "delta_pct": 4.2,
        "source": "PostHog",
        "updated": "4m ago",
    }

    def test_the_value_is_drawn_as_a_headline(self):
        screen = draw(pages.one_number, self.NUMBER)
        self.assertTrue(blocks.drew_block_text(screen, "8412"))

    def test_the_label_is_shown(self):
        screen = draw(pages.one_number, self.NUMBER)
        self.assertIn("WEEKLY ACTIVE", texts(screen))

    def test_the_delta_carries_its_sign(self):
        screen = draw(pages.one_number, self.NUMBER)
        self.assertIn("+4.2%", texts(screen))

    def test_a_long_number_still_fits_on_the_screen(self):
        screen = draw(pages.one_number, dict(self.NUMBER, value=123456789))
        match = blocks.drew_block_text(screen, "123456789")
        self.assertIsNotNone(match)

    def test_a_spark_longer_than_the_cap_keeps_the_most_recent_points(self):
        from sb.constants import SPARK_POINTS

        screen = draw(pages.one_number, dict(self.NUMBER, spark=list(range(100))))
        self.assertTrue(screen.calls)
        self.assertEqual(len(pages.one_number._clean_points(list(range(100)))), SPARK_POINTS)

    def test_a_flat_spark_still_draws(self):
        screen = draw(pages.one_number, dict(self.NUMBER, spark=[5] * 30))
        self.assertTrue(screen.calls)

    def test_no_number_yet_says_so(self):
        screen = draw(pages.one_number, {"label": "Weekly active", "value": None})
        self.assertTrue(blocks.drew_block_text(screen, "NO NUMBER YET"))

    def test_this_page_never_lights_the_leds(self):
        self.assertFalse(hasattr(pages.one_number, "leds"))


if __name__ == "__main__":
    unittest.main()
