import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from testing import fakes  # noqa: F401  (installs runtime stubs)
from testing.fakes import FakeScreen

from sb import pairing
from sb import ui


class FakeColor:
    def rgb(self, r, g, b):
        return (r, g, b)


class FakeShape:
    def rectangle(self, x, y, w, h):
        return ("rect", x, y, w, h)


class StubMachine:
    """Only the fields PairingScreen reads. The real machine is exercised in
    test_pairing; this keeps the drawing tests from depending on transitions."""

    def __init__(self, state, user_code=None, uri=None, message="", detail=None, left=None):
        self.state = state
        self.user_code = user_code
        self.verification_uri = uri
        self.message = message
        self.detail = detail
        self._left = left

    def seconds_left(self, now_ms):
        return self._left


def _screen():
    return PairingScreenFixture()


class PairingScreenFixture:
    def __init__(self):
        self.screen = FakeScreen()
        self.view = ui.PairingScreen(self.screen, FakeShape(), FakeColor())

    def draw(self, machine, now=0):
        self.view.draw(machine, now)
        return self.screen


class TestFormatRemaining(unittest.TestCase):
    def test_reads_as_minutes_and_seconds(self):
        self.assertEqual(ui.format_remaining(540), "9:00 left")
        self.assertEqual(ui.format_remaining(595), "9:55 left")
        self.assertEqual(ui.format_remaining(9), "0:09 left")

    def test_never_counts_below_zero(self):
        self.assertEqual(ui.format_remaining(-5), "0:00 left")

    def test_no_deadline_is_no_text(self):
        self.assertEqual(ui.format_remaining(None), "")


class TestFitSize(unittest.TestCase):
    def test_shrinks_until_the_text_fits(self):
        # FakeScreen measures len(text) * size wide by size tall.
        size = ui.fit_size(FakeScreen().measure_text, "WXYZ", 40, 100)
        self.assertEqual(size, 10)

    def test_never_goes_below_the_floor(self):
        size = ui.fit_size(FakeScreen().measure_text, "WXYZ", 1, 1)
        self.assertEqual(size, ui.CODE_MIN_SIZE)

    def test_takes_the_max_when_there_is_room(self):
        size = ui.fit_size(FakeScreen().measure_text, "W", 10000, 10000)
        self.assertEqual(size, ui.CODE_MAX_SIZE)

    def test_height_constrains_as_well_as_width(self):
        size = ui.fit_size(FakeScreen().measure_text, "W", 10000, 9)
        self.assertEqual(size, 9)


class TestQrLayout(unittest.TestCase):
    def test_scale_leaves_room_for_the_quiet_zone(self):
        scale, x, y, side = ui.qr_layout(29, 136, 34, 176, 198)
        self.assertEqual(side, (29 + ui.QUIET * 2) * scale)
        self.assertLessEqual(side, 176)
        # The first dark module sits a full quiet zone inside the card.
        self.assertEqual(x, 136 + (176 - side) // 2 + ui.QUIET * scale)
        self.assertEqual(y, 34 + (198 - side) // 2 + ui.QUIET * scale)

    def test_scale_is_whole_pixels(self):
        scale, _, _, _ = ui.qr_layout(33, 0, 0, 176, 198)
        self.assertEqual(scale, int(scale))
        self.assertEqual(scale, 176 // (33 + ui.QUIET * 2))

    def test_scale_never_drops_below_one(self):
        scale, _, _, _ = ui.qr_layout(177, 0, 0, 176, 198)
        self.assertEqual(scale, 1)

    def test_the_card_fits_between_the_header_and_the_code(self):
        # The QR is centered across the full width, in the band left between
        # the header above and the code and timer below.
        box_h = ui.HEIGHT - ui.HEADER_H - ui.CODE_H - ui.TIMER_H - ui.MARGIN
        scale, x, y, side = ui.qr_layout(29, 0, ui.HEADER_H, ui.QR_BOX, box_h)
        left = x - ui.QUIET * scale
        top = y - ui.QUIET * scale
        self.assertGreaterEqual(left, 0)
        self.assertLessEqual(left + side, ui.WIDTH)
        self.assertGreaterEqual(top, ui.HEADER_H)
        # Clear of the code strip, so the two never collide.
        self.assertLessEqual(top + side, ui.HEIGHT - ui.CODE_H - ui.TIMER_H)

    def test_the_qr_band_stays_large_enough_for_scale_four(self):
        # A 29 module code at scale 3 loses a third of its size and gets
        # noticeably harder to scan, so the band is sized to hold scale 4.
        box_h = ui.HEIGHT - ui.HEADER_H - ui.CODE_H - ui.TIMER_H - ui.MARGIN
        scale, _, _, _ = ui.qr_layout(29, 0, ui.HEADER_H, ui.QR_BOX, box_h)
        self.assertGreaterEqual(scale, 4)


class TestDrawing(unittest.TestCase):
    def test_waiting_draws_the_code_and_the_qr(self):
        fixture = _screen()
        machine = StubMachine(
            pairing.STATE_WAITING,
            user_code="WXYZ-1234",
            uri="https://web.example/link?code=WXYZ-1234",
            message="Scan to pair",
            left=540,
        )
        screen = fixture.draw(machine)
        drawn = [call[1] for call in screen.texts()]
        # One line, dash kept: it is the fallback someone reads or types.
        self.assertIn("WXYZ-1234", drawn)
        self.assertIn("9:00 left", drawn)
        self.assertTrue(any(call[0] == "shape" for call in screen.calls))

    def test_the_code_is_drawn_large_enough_to_read_across_a_table(self):
        fixture = _screen()
        machine = StubMachine(
            pairing.STATE_WAITING,
            user_code="WXYZ-1234",
            uri="https://web.example/link?code=WXYZ-1234",
        )
        screen = fixture.draw(machine)
        sizes = [call[4] for call in screen.texts() if call[1] == "WXYZ-1234"]
        self.assertTrue(sizes, "the code was not drawn")
        self.assertTrue(all(size >= 12 for size in sizes), sizes)

    def test_the_qr_matrix_is_encoded_once_per_uri(self):
        fixture = _screen()
        machine = StubMachine(
            pairing.STATE_WAITING,
            user_code="WXYZ-1234",
            uri="https://web.example/link?code=WXYZ-1234",
        )
        fixture.draw(machine)
        first = fixture.view._matrix
        fixture.draw(machine)
        self.assertIs(fixture.view._matrix, first)

    def test_a_new_code_re_encodes(self):
        fixture = _screen()
        machine = StubMachine(pairing.STATE_WAITING, user_code="AAAA-1111", uri="https://a/1")
        fixture.draw(machine)
        first = fixture.view._matrix
        machine.verification_uri = "https://a/2"
        fixture.draw(machine)
        self.assertIsNot(fixture.view._matrix, first)

    def test_waiting_without_a_uri_still_draws_the_code(self):
        fixture = _screen()
        screen = fixture.draw(StubMachine(pairing.STATE_WAITING, user_code="WXYZ-1234"))
        self.assertIn("WXYZ-1234", [call[1] for call in screen.texts()])

    def test_every_state_draws_something(self):
        states = (
            pairing.STATE_CONNECTING,
            pairing.STATE_NO_NETWORK,
            pairing.STATE_NO_CREDENTIALS,
            pairing.STATE_STARTING,
            pairing.STATE_WAITING,
            pairing.STATE_APPROVED,
            pairing.STATE_EXPIRED,
            pairing.STATE_DENIED,
            pairing.STATE_ERROR,
            pairing.STATE_DONE,
        )
        for state in states:
            fixture = _screen()
            screen = fixture.draw(
                StubMachine(state, user_code="WXYZ-1234", uri="https://a/1", message="Working")
            )
            self.assertTrue(screen.texts(), "no text drawn for state %s" % state)

    def test_an_over_long_uri_drops_the_qr_rather_than_crashing(self):
        fixture = _screen()
        machine = StubMachine(
            pairing.STATE_WAITING, user_code="WXYZ-1234", uri="https://a/" + "x" * 5000
        )
        screen = fixture.draw(machine)
        self.assertIsNone(fixture.view._matrix)
        self.assertIn("WXYZ-1234", [call[1] for call in screen.texts()])


if __name__ == "__main__":
    unittest.main()


class Pictures(unittest.TestCase):
    """One implementation, shared by every app that draws a picture."""

    class Loader:
        def __init__(self, fails=None):
            self.fails = fails
            self.asked = []

        def load(self, path):
            self.asked.append(path)
            if self.fails:
                raise self.fails
            return ("image", path)

    def test_a_path_becomes_a_drawable_picture(self):
        source, error = ui.load_picture(self.Loader(), "/badge/images/a.png")

        self.assertEqual(source, ("image", "/badge/images/a.png"))
        self.assertEqual(error, "")

    def test_no_path_is_not_an_error(self):
        # A question or a profile without a picture is a normal state.
        source, error = ui.load_picture(self.Loader(), None)

        self.assertIsNone(source)
        self.assertEqual(error, "")

    def test_a_firmware_with_no_image_global_says_so(self):
        # BadgeOS injects `image` into an app's namespace. An app that failed
        # to pass it down used to fail silently; now the card can say why.
        source, error = ui.load_picture(None, "/badge/images/a.png")

        self.assertIsNone(source)
        self.assertEqual(error, "no image global")

    def test_a_picture_the_firmware_will_not_decode_names_the_failure(self):
        source, error = ui.load_picture(self.Loader(fails=OSError("bad png")), "/p/a.png")

        self.assertIsNone(source)
        self.assertIn("bad png", error)

    def test_a_rect_scales_the_picture_into_the_box(self):
        # blit only scales when handed a rect, and rect is a BadgeOS
        # constructor: a tuple raises, which is what "blit failed" was.
        class Screen:
            def __init__(self):
                self.blits = []

            def blit(self, source, *where):
                self.blits.append((source,) + where)

        screen = Screen()
        rect = lambda x, y, w, h: ("rect", x, y, w, h)  # noqa: E731

        self.assertTrue(ui.draw_picture(screen, ("image", "/p/a.png"), 8, 4, 88, 88, rect))
        self.assertEqual(screen.blits, [(("image", "/p/a.png"), ("rect", 8, 4, 88, 88))])

    def test_without_a_rect_it_draws_at_its_own_size(self):
        # The normal case now: the server stores a picture at the size it will
        # be drawn, so one to one is already right.
        class Screen:
            def __init__(self):
                self.blits = []

            def blit(self, source, *where):
                self.blits.append((source,) + where)

        screen = Screen()

        self.assertTrue(ui.draw_picture(screen, ("image", "/p/a.png"), 8, 4, 88, 88))
        self.assertEqual(screen.blits, [(("image", "/p/a.png"), 8, 4)])

    def test_a_rect_that_the_firmware_refuses_falls_back(self):
        class Screen:
            def __init__(self):
                self.blits = []

            def blit(self, source, *where):
                if len(where) == 1:
                    raise TypeError("this firmware wants x and y")
                self.blits.append((source,) + where)

        screen = Screen()
        rect = lambda x, y, w, h: ("rect", x, y, w, h)  # noqa: E731

        self.assertTrue(ui.draw_picture(screen, ("image", "/p/a.png"), 8, 4, 88, 88, rect))
        self.assertEqual(screen.blits, [(("image", "/p/a.png"), 8, 4)])

    def test_nothing_to_draw_is_not_a_failure_to_draw(self):
        self.assertFalse(ui.draw_picture(object(), None, 0, 0, 10, 10))

    def test_a_firmware_without_blit_costs_the_picture_and_nothing_else(self):
        class Screen:
            def blit(self, source, *where):
                raise AttributeError("no blit")

        self.assertFalse(ui.draw_picture(Screen(), ("image", "/p/a.png"), 0, 0, 10, 10))
