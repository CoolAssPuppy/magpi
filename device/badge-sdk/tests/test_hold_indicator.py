"""Showing that a hold is being counted.

Holding B for a second and a half re-pairs the badge, and it drew nothing at
all while doing it. A wearer who cannot see a gesture being counted assumes the
button is dead and lets go at exactly the wrong moment.

The protection the gesture already had must survive being made visible: a pin
that reads held from the first frame still never arms, and now it draws nothing
either, because a bar there would advertise a hold that will not fire.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from testing import fakes  # noqa: E402

from sb import ui  # noqa: E402
from sb.app import B_HOLD_MS  # noqa: E402


class Palette:
    dim = "dim"
    accent = "accent"
    fg = "fg"


class Drawn(unittest.TestCase):
    def setUp(self):
        self.screen = fakes.FakeScreen()
        self.shape = fakes.FakeShape()

    def draw(self, progress, **kwargs):
        return ui.draw_hold(self.screen, self.shape, Palette(), progress, **kwargs)

    def bars(self):
        return [call[1] for call in self.screen.calls if call[0] == "shape"]

    def test_nothing_is_drawn_before_a_hold_starts(self):
        self.assertFalse(self.draw(0))
        self.assertEqual(self.screen.calls, [])

    def test_a_released_button_leaves_no_mark(self):
        self.assertFalse(self.draw(None))
        self.assertEqual(self.screen.calls, [])

    def test_a_hold_in_progress_draws_a_track_and_a_fill(self):
        self.assertTrue(self.draw(0.5))

        track, fill = self.bars()
        self.assertEqual(track[3], 320)
        self.assertEqual(fill[3], 160)

    def test_the_fill_grows_with_the_hold(self):
        widths = []
        for progress in (0.25, 0.5, 0.75):
            self.screen.calls = []
            self.draw(progress)
            widths.append(self.bars()[1][3])

        self.assertEqual(widths, sorted(widths))
        self.assertEqual(len(set(widths)), 3)

    def test_a_hold_past_the_end_does_not_draw_off_the_screen(self):
        self.draw(4.0)

        self.assertEqual(self.bars()[1][3], 320)

    def test_the_bar_sits_on_the_bottom_edge(self):
        self.draw(0.5)

        track = self.bars()[0]
        self.assertEqual(track[2] + track[4], 240)

    def test_a_label_names_what_the_hold_will_do(self):
        self.draw(0.5, label="Hold to re-pair")

        texts = [call[1] for call in self.screen.calls if call[0] == "text"]
        self.assertEqual(texts, ["Hold to re-pair"])

    def test_the_bar_is_drawn_at_the_size_the_screen_reports(self):
        # A badge that never called badge.mode() is 160x120, and a bar drawn
        # for 320 would run off it.
        ui.draw_hold(self.screen, self.shape, Palette(), 1.0, width=160, height=120)

        track = self.bars()[0]
        self.assertEqual(track[3], 160)
        self.assertEqual(track[2] + track[4], 120)


class Counted(unittest.TestCase):
    """The progress the runtime hands the drawing, and when it refuses to."""

    def setUp(self):
        from sb.app import BadgeApp, Env, RunSpec

        self.buttons = fakes.ButtonQueue()
        self.env = Env(
            fakes.fake_badge,
            fakes.FakeScreen(),
            fakes.FakeShape(),
            fakes.FakeColor(),
            "BUTTON_A",
            "BUTTON_B",
        )
        self.app = BadgeApp(
            RunSpec(
                make_machine=lambda fetch: None,
                make_view=lambda screen, shape, color: None,
                fetch=lambda power=None: None,
                unpaired_state="unpaired",
            ),
            self.env,
        )

    def hold_for(self, ms, armed=True):
        self.app.b_hold_armed = armed
        self.buttons.hold("BUTTON_B")
        self.app._b_hold_opens_pairing(0)
        self.buttons.hold("BUTTON_B")
        return self.app._b_hold_opens_pairing(ms)

    def test_a_hold_reports_how_far_through_it_is(self):
        self.hold_for(B_HOLD_MS // 2)

        self.assertAlmostEqual(self.app.b_hold_progress, 0.5, places=2)

    def test_a_completed_hold_reports_full(self):
        fired = self.hold_for(B_HOLD_MS)

        self.assertTrue(fired)
        self.assertEqual(self.app.b_hold_progress, 1.0)

    def test_letting_go_clears_the_mark(self):
        self.hold_for(B_HOLD_MS // 2)

        # The queue hands out a hold until the frame ends, so ending one is
        # what releasing the button looks like from here.
        self.buttons.frame(lambda: None, advance_ms=0)
        self.app._b_hold_opens_pairing(B_HOLD_MS)

        self.assertEqual(self.app.b_hold_progress, 0.0)

    def test_a_pin_stuck_from_the_first_frame_draws_nothing(self):
        # It can never wipe a token, so it must never look like it is about to.
        self.buttons.hold("BUTTON_B")
        self.app.b_hold_armed = False

        fired = self.app._b_hold_opens_pairing(B_HOLD_MS * 4)

        self.assertFalse(fired)
        self.assertEqual(self.app.b_hold_progress, 0.0)

    def test_a_firmware_without_held_draws_nothing(self):
        self.app.env.badge.held = lambda button: (_ for _ in ()).throw(OSError("no held"))

        self.assertFalse(self.app._b_hold_opens_pairing(B_HOLD_MS))
        self.assertEqual(self.app.b_hold_progress, 0.0)


if __name__ == "__main__":
    unittest.main()
