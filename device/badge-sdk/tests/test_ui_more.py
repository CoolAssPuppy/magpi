import builtins
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from testing import fakes  # noqa: F401  (installs runtime stubs)
from testing import blocks
from testing.fakes import FakeColor, FakeScreen, FakeShape

from sb import pairing
from sb import ui


class StubMachine:
    """Only the fields PairingScreen reads, as in test_ui."""

    def __init__(self, state, user_code=None, uri=None, message="", detail=None, left=None):
        self.state = state
        self.user_code = user_code
        self.verification_uri = uri
        self.message = message
        self.detail = detail
        self._left = left

    def seconds_left(self, now_ms):
        return self._left


def _pairing_screen():
    screen = FakeScreen()
    return screen, ui.PairingScreen(screen, FakeShape(), FakeColor())


def _rects(screen):
    """Every rectangle drawn, in order."""
    return [
        call[1]
        for call in screen.calls
        if call[0] == "shape" and isinstance(call[1], tuple) and call[1][0] == "rect"
    ]


def _rects_with_pens(screen):
    """(pen, rectangle) for each rectangle, so a test can say what colour a
    piece of chrome was drawn in without counting calls."""
    pen = None
    found = []
    for call in screen.calls:
        if call[0] == "pen":
            pen = call[1]
        elif call[0] == "shape" and isinstance(call[1], tuple) and call[1][0] == "rect":
            found.append((pen, call[1]))
    return found


def _texts_with_pens(screen):
    """(pen, text call) for each string drawn."""
    pen = None
    found = []
    for call in screen.calls:
        if call[0] == "pen":
            pen = call[1]
        elif call[0] == "text":
            found.append((pen, call))
    return found


class TestRomFonts(unittest.TestCase):
    """`rom_font` is a BadgeOS global. It is absent under test unless a test
    puts it there, which is what these install and clean up."""

    def _install(self, font_module):
        setattr(builtins, "rom_font", font_module)
        self.addCleanup(delattr, builtins, "rom_font")

    def test_a_font_the_firmware_has_comes_back(self):
        self._install(types.SimpleNamespace(smart="a-smart-font"))

        self.assertEqual(ui.rom_font_named("smart"), "a-smart-font")

    def test_a_font_the_firmware_lacks_degrades_to_none(self):
        # An older firmware without badgewaremax must cost the size, not the
        # screen.
        self._install(types.SimpleNamespace(smart="a-smart-font"))

        self.assertIsNone(ui.rom_font_named("badgewaremax"))

    def test_no_rom_font_at_all_is_not_an_error(self):
        self.assertIsNone(ui.rom_font_named("smart"))

    def test_the_welcome_line_is_set_in_the_font_the_firmware_has(self):
        self._install(types.SimpleNamespace(smart="a-smart-font", sins="a-sins-font"))
        screen, view = _pairing_screen()

        view.draw(StubMachine(pairing.STATE_WAITING, user_code="WXYZ-1234"))

        # Welcome takes smart, the prompt under it takes sins.
        self.assertEqual(screen.font, "a-sins-font")

    def test_a_screen_with_no_rom_fonts_keeps_whatever_font_it_had(self):
        screen, view = _pairing_screen()
        screen.font = "whatever-was-already-there"

        view.draw(StubMachine(pairing.STATE_WAITING, user_code="WXYZ-1234"))

        self.assertEqual(screen.font, "whatever-was-already-there")

    def test_every_named_rom_font_has_a_height(self):
        for name in (ui.FONT_WELCOME, ui.FONT_PROMPT, ui.FONT_CODE, ui.FONT_SMALL):
            self.assertIn(name, ui.ROM_FONT_SIZES)


class TestVectorFont(unittest.TestCase):
    """picovector is a BadgeOS module and the font lives on /system, so
    neither exists off the badge. These stand one up to exercise the path the
    badge takes, and empty the load cache either side so the fake cannot leak
    into another test."""

    def setUp(self):
        self._saved = dict(ui._vector_fonts)
        ui._vector_fonts.clear()
        self.addCleanup(self._restore)

    def _restore(self):
        ui._vector_fonts.clear()
        ui._vector_fonts.update(self._saved)
        sys.modules.pop("picovector", None)

    def _install_picovector(self, loader):
        module = types.ModuleType("picovector")
        module.font = types.SimpleNamespace(load=loader)
        sys.modules["picovector"] = module
        return module

    def test_a_badge_with_the_font_file_gets_the_vector_font(self):
        self._install_picovector(lambda path: ("vector", path))

        self.assertEqual(
            ui.vector_font_at(ui.CODE_FONT_PATH), ("vector", ui.CODE_FONT_PATH)
        )

    def test_the_font_file_is_read_once_and_reused(self):
        # font.load parses a file and the draw loop asks every frame.
        asked = []

        def load(path):
            asked.append(path)
            return ("vector", path)

        self._install_picovector(load)

        ui.vector_font_at(ui.CODE_FONT_PATH)
        ui.vector_font_at(ui.CODE_FONT_PATH)

        self.assertEqual(asked, [ui.CODE_FONT_PATH])

    def test_a_missing_font_file_is_remembered_as_missing(self):
        asked = []

        def load(path):
            asked.append(path)
            raise OSError("no such file")

        self._install_picovector(load)

        self.assertIsNone(ui.vector_font_at("/system/assets/fonts/Nope.af"))
        self.assertIsNone(ui.vector_font_at("/system/assets/fonts/Nope.af"))
        self.assertEqual(len(asked), 1)

    def test_no_picovector_leaves_the_caller_on_its_rom_font(self):
        self.assertIsNone(ui.vector_font_at(ui.CODE_FONT_PATH))

    def test_the_pairing_code_is_set_in_the_vector_font_when_there_is_one(self):
        self._install_picovector(lambda path: ("vector", path))
        screen, view = _pairing_screen()

        view.draw(StubMachine(pairing.STATE_WAITING, user_code="WXYZ-1234"))

        # The code is the one string that has to read at arm's length, so it
        # gets the font that honours a size argument.
        self.assertIn("WXYZ-1234", [call[1] for call in screen.texts()])

    def test_the_code_grows_past_the_rom_font_ceiling(self):
        # The point of the vector font: every ROM font tops out at 20 pixels,
        # so fit_size could never fill the band it is given.
        self._install_picovector(lambda path: ("vector", path))
        screen, view = _pairing_screen()

        view.draw(StubMachine(pairing.STATE_WAITING, user_code="WXYZ-1234"))

        sizes = [call[4] for call in screen.texts() if call[1] == "WXYZ-1234"]
        self.assertTrue(sizes, "the code was not drawn")
        self.assertTrue(all(size <= ui.CODE_MAX_SIZE for size in sizes), sizes)


class TestPairingStates(unittest.TestCase):
    def test_a_state_the_screen_does_not_know_draws_the_message(self):
        # New states arrive from the machine; a screen that drew nothing for
        # one would read as a badge that had died.
        screen, view = _pairing_screen()

        view.draw(StubMachine("some-new-state", message="Thinking"))

        self.assertIn("Thinking", [call[1] for call in screen.texts()])

    def test_a_detail_under_a_verdict_is_drawn_below_it(self):
        screen, view = _pairing_screen()

        view.draw(StubMachine(pairing.STATE_DENIED, message="", detail="Ask again"))

        drawn = {call[1]: call for call in screen.texts()}
        self.assertIn("Declined", drawn)
        self.assertIn("Ask again", drawn)
        self.assertGreater(drawn["Ask again"][3], drawn["Declined"][3])

    def test_a_verdict_detail_is_quieter_than_the_verdict(self):
        screen, view = _pairing_screen()
        palette = view.palette

        view.draw(StubMachine(pairing.STATE_EXPIRED, detail="Press A to retry"))

        pens = {call[1]: pen for pen, call in _texts_with_pens(screen)}
        self.assertEqual(pens["Code expired"], palette.warn)
        self.assertEqual(pens["Press A to retry"], palette.dim)

    def test_a_detail_while_waiting_is_drawn_above_the_code(self):
        screen, view = _pairing_screen()

        view.draw(
            StubMachine(
                pairing.STATE_WAITING,
                user_code="WXYZ-1234",
                detail="Retrying",
                left=90,
            )
        )

        drawn = {call[1]: call for call in screen.texts()}
        self.assertIn("Retrying", drawn)
        self.assertLessEqual(drawn["Retrying"][3], drawn["WXYZ-1234"][3])

    def test_a_waiting_detail_is_drawn_as_a_warning(self):
        screen, view = _pairing_screen()

        view.draw(
            StubMachine(pairing.STATE_WAITING, user_code="WXYZ-1234", detail="Retrying")
        )

        pens = {call[1]: pen for pen, call in _texts_with_pens(screen)}
        self.assertEqual(pens["Retrying"], view.palette.warn)

    def test_no_deadline_draws_no_timer(self):
        screen, view = _pairing_screen()

        view.draw(StubMachine(pairing.STATE_WAITING, user_code="WXYZ-1234", left=None))

        self.assertFalse([call for call in screen.texts() if "left" in call[1]])

    def test_no_code_yet_draws_the_welcome_and_nothing_to_read_out(self):
        screen, view = _pairing_screen()

        view.draw(StubMachine(pairing.STATE_WAITING, user_code=None, left=None))

        drawn = [call[1] for call in screen.texts()]
        self.assertIn(ui.WELCOME, drawn)
        self.assertIn(ui.PROMPT, drawn)

    def test_a_long_verdict_shrinks_rather_than_running_off_the_screen(self):
        screen, view = _pairing_screen()
        message = "Something went wrong while talking to the server"

        view.draw(StubMachine(pairing.STATE_ERROR, message=message))

        drawn = [call for call in screen.texts() if call[1] == message]
        self.assertTrue(drawn)
        # FakeScreen measures len(text) * size wide.
        width = len(message) * drawn[0][4]
        self.assertLessEqual(width, ui.WIDTH - ui.MARGIN * 2)


class TestChrome(unittest.TestCase):
    def setUp(self):
        self.screen = FakeScreen()
        self.shape = FakeShape()
        self.palette = ui.Palette(FakeColor())

    def test_a_box_is_drawn_in_whole_pixels(self):
        # Vector coordinates arrive as floats from a fraction of a bar; a
        # fractional module boundary is what makes chrome look soft.
        ui.fill(self.screen, self.shape, 1.5, 2.5, 3.5, 4.5)

        self.assertEqual(_rects(self.screen), [("rect", 1, 2, 3, 4)])

    def test_a_frame_is_hollow(self):
        ui.frame(self.screen, self.shape, 10, 20, 100, 50, t=2)

        self.assertEqual(
            _rects(self.screen),
            [
                ("rect", 10, 20, 100, 2),
                ("rect", 10, 68, 100, 2),
                ("rect", 10, 20, 2, 50),
                ("rect", 108, 20, 2, 50),
            ],
        )

    def test_a_frame_is_thick_enough_to_see_at_a_metre(self):
        ui.frame(self.screen, self.shape, 0, 0, 40, 40)

        self.assertTrue(all(ui.HAIRLINE in (rect[3], rect[4]) for rect in _rects(self.screen)))
        self.assertGreaterEqual(ui.HAIRLINE, 2)

    def test_a_panel_is_a_surface_with_a_hairline_around_it(self):
        ui.panel(self.screen, self.shape, self.palette, 4, 8, 200, 60)

        drawn = _rects_with_pens(self.screen)
        self.assertEqual(drawn[0], (self.palette.panel, ("rect", 4, 8, 200, 60)))
        self.assertEqual([pen for pen, _ in drawn[1:]], [self.palette.line] * 4)

    def test_a_panel_can_be_bounded_in_another_colour(self):
        # A live panel is marked by its edge, not by a second fill.
        ui.panel(self.screen, self.shape, self.palette, 0, 0, 10, 10, border=self.palette.accent)

        drawn = _rects_with_pens(self.screen)
        self.assertEqual(drawn[0][0], self.palette.panel)
        self.assertEqual([pen for pen, _ in drawn[1:]], [self.palette.accent] * 4)

    def test_scanlines_darken_every_eighth_row(self):
        ui.scanlines(self.screen, self.shape, self.palette, 0, 40, 320, 24)

        drawn = _rects_with_pens(self.screen)
        self.assertEqual([rect[2] for _, rect in drawn], [40, 48, 56])
        self.assertTrue(all(rect[4] == 1 for _, rect in drawn))
        self.assertTrue(all(pen == self.palette.scanline for pen, _ in drawn))

    def test_scanlines_stay_inside_the_box(self):
        ui.scanlines(self.screen, self.shape, self.palette, 8, 10, 100, 20, step=6)

        for _, rect in _rects_with_pens(self.screen):
            self.assertGreaterEqual(rect[2], 10)
            self.assertLess(rect[2], 30)
            self.assertEqual((rect[1], rect[3]), (8, 100))

    def test_a_closer_step_draws_more_rows(self):
        ui.scanlines(self.screen, self.shape, self.palette, 0, 0, 10, 24, step=3)

        self.assertEqual(len(_rects(self.screen)), 8)


class TestStatusBar(unittest.TestCase):
    def setUp(self):
        self.screen = FakeScreen()
        self.shape = FakeShape()
        self.palette = ui.Palette(FakeColor())

    def test_it_answers_the_three_questions_a_badge_screen_has_room_for(self):
        height = ui.status_bar(
            self.screen, self.shape, self.palette, left="MAGPI", middle="14:05", right="3/8"
        )

        self.assertEqual(height, ui.STATUS_H)
        self.assertEqual(
            [call[1] for call in self.screen.texts()], ["MAGPI", "14:05", "3/8"]
        )

    def test_the_middle_slot_is_centred_and_the_right_slot_is_right_aligned(self):
        ui.status_bar(
            self.screen, self.shape, self.palette, left="MAGPI", middle="14:05", right="3/8"
        )

        drawn = {call[1]: call for call in self.screen.texts()}
        middle_w = len("14:05") * ui.STATUS_SIZE
        right_w = len("3/8") * ui.STATUS_SIZE
        self.assertEqual(drawn["MAGPI"][2], ui.STATUS_PAD)
        self.assertEqual(drawn["14:05"][2], (ui.WIDTH - middle_w) // 2)
        self.assertEqual(drawn["3/8"][2] + right_w, ui.WIDTH - ui.STATUS_PAD)

    def test_the_app_name_carries_the_accent_and_the_rest_stays_quiet(self):
        ui.status_bar(
            self.screen, self.shape, self.palette, left="MAGPI", middle="14:05", right="3/8"
        )

        pens = {call[1]: pen for pen, call in _texts_with_pens(self.screen)}
        self.assertEqual(pens["MAGPI"], self.palette.accent)
        self.assertEqual(pens["14:05"], self.palette.dim)
        self.assertEqual(pens["3/8"], self.palette.dim)

    def test_a_stale_bar_can_say_so_in_its_own_colour(self):
        ui.status_bar(
            self.screen, self.shape, self.palette, left="MAGPI", accent=self.palette.warn
        )

        pens = {call[1]: pen for pen, call in _texts_with_pens(self.screen)}
        self.assertEqual(pens["MAGPI"], self.palette.warn)

    def test_an_empty_slot_draws_nothing(self):
        ui.status_bar(self.screen, self.shape, self.palette)

        self.assertEqual(self.screen.texts(), [])

    def test_the_strip_is_a_surface_with_a_line_under_it(self):
        ui.status_bar(self.screen, self.shape, self.palette, left="MAGPI")

        drawn = _rects_with_pens(self.screen)
        self.assertEqual(drawn[0], (self.palette.panel, ("rect", 0, 0, ui.WIDTH, ui.STATUS_H)))
        self.assertEqual(
            drawn[1], (self.palette.line, ("rect", 0, ui.STATUS_H - 1, ui.WIDTH, 1))
        )


class TestMeter(unittest.TestCase):
    def setUp(self):
        self.screen = FakeScreen()
        self.shape = FakeShape()
        self.palette = ui.Palette(FakeColor())

    def _meter(self, fraction, **kwargs):
        return ui.meter(self.screen, self.shape, self.palette, 10, 20, 100, 8, fraction, **kwargs)

    def test_an_empty_meter_is_a_track_and_nothing_else(self):
        self.assertEqual(self._meter(0), 0)

        self.assertEqual(
            _rects_with_pens(self.screen), [(self.palette.line, ("rect", 10, 20, 100, 8))]
        )

    def test_a_half_full_meter_fills_half_the_track(self):
        width = self._meter(0.5)

        self.assertEqual(width, 48)
        self.assertEqual(
            _rects_with_pens(self.screen)[1], (self.palette.accent, ("rect", 10, 20, 48, 8))
        )

    def test_a_full_meter_fills_the_track(self):
        self.assertEqual(self._meter(1), 100)

    def test_more_than_full_is_still_full(self):
        self.assertEqual(self._meter(4), 100)

    def test_the_smallest_progress_there_is_still_shows(self):
        # One vote in a hundred has to be visible, or the meter reads as empty
        # and the tally reads as broken.
        self.assertEqual(self._meter(0.001), 4)

    def test_two_fractions_a_percent_apart_draw_the_same_bar(self):
        # Quantised on purpose: this design system counts, it does not slide.
        first = self._meter(0.50)
        self.screen.calls = []
        second = self._meter(0.51)

        self.assertEqual(first, second)

    def test_a_meter_can_be_given_its_own_colours(self):
        self._meter(0.5, pen=self.palette.bad, track=self.palette.scanline)

        pens = [pen for pen, _ in _rects_with_pens(self.screen)]
        self.assertEqual(pens, [self.palette.scanline, self.palette.bad])

    def test_a_narrow_meter_still_fills(self):
        # Under four pixels wide there is less than one cell to light.
        width = ui.meter(self.screen, self.shape, self.palette, 0, 0, 3, 4, 0.5)

        self.assertEqual(width, 3)


class TestDrawnType(unittest.TestCase):
    def setUp(self):
        self.screen = FakeScreen()
        self.shape = FakeShape()

    def test_a_heading_is_drawn_from_the_glyph_table(self):
        ui.block_text(self.screen, self.shape, "PAIRED", 8, 40, 4)

        self.assertTrue(blocks.drew_block_text(self.screen, "PAIRED"))
        self.assertEqual(blocks.block_size(self.screen, "PAIRED"), 4)
        self.assertEqual(blocks.block_top(self.screen, "PAIRED"), 40)

    def test_lower_case_is_set_in_the_same_capitals(self):
        ui.block_text(self.screen, self.shape, "hold", 0, 0, 3)

        self.assertTrue(blocks.drew_block_text(self.screen, "HOLD"))

    def test_the_pen_belongs_to_the_caller(self):
        # A heading is often two colours; setting a pen here would take that
        # away from whoever is drawing it.
        ui.block_text(self.screen, self.shape, "MAGPI", 0, 0, 2)

        self.assertEqual([call for call in self.screen.calls if call[0] == "pen"], [])

    def test_a_cell_is_drawn_whole(self):
        ui.block_text(self.screen, self.shape, "MAGPI", 0, 0, 3)

        self.assertTrue(all(rect[4] == 3 for rect in _rects(self.screen)))

    def test_a_run_of_lit_cells_is_one_rectangle(self):
        # A heading is 25 glyphs of 35 cells; a rectangle per cell would block
        # the frame loop.
        ui.block_text(self.screen, self.shape, "I", 0, 0, 1)

        # I is two full bars and a stem: 5 + 5 wide plus five single cells.
        widths = sorted(rect[3] for rect in _rects(self.screen))
        self.assertEqual(widths, [1, 1, 1, 1, 1, 5, 5])

    def test_a_character_the_table_has_no_glyph_for_costs_a_space(self):
        ui.block_text(self.screen, self.shape, "A#A", 0, 0, 2)
        with_gap = _rects(self.screen)

        spaced = FakeScreen()
        ui.block_text(spaced, self.shape, "A A", 0, 0, 2)

        self.assertEqual(with_gap, _rects(spaced))

    def test_it_returns_where_the_next_thing_can_start(self):
        end = ui.block_text(self.screen, self.shape, "AB", 12, 0, 3)

        self.assertEqual(end, 12 + ui.block_width("AB", 3))

    def test_a_word_is_as_wide_as_its_cells_less_the_trailing_gap(self):
        # The tracking sits between letters, not after the last one.
        self.assertEqual(
            ui.block_width("AB", 3),
            2 * (ui.BLOCK_W + ui.BLOCK_TRACKING) * 3 - ui.BLOCK_TRACKING * 3,
        )

    def test_nothing_has_no_width(self):
        self.assertEqual(ui.block_width("", 4), 0)

    def test_a_bigger_cell_makes_a_wider_word(self):
        self.assertGreater(ui.block_width("MAGPI", 4), ui.block_width("MAGPI", 3))

    def test_a_centred_heading_sits_in_the_middle_of_the_panel(self):
        ui.block_centred(self.screen, self.shape, "DONE", 60, 4)

        expected = FakeScreen()
        left = (ui.WIDTH - ui.block_width("DONE", 4)) // 2
        ui.block_text(expected, self.shape, "DONE", left, 60, 4)

        self.assertEqual(_rects(self.screen), _rects(expected))

    def test_a_centred_heading_reports_the_height_it_took(self):
        height = ui.block_centred(self.screen, self.shape, "DONE", 60, 4)

        self.assertEqual(height, ui.BLOCK_H * 4)

    def test_a_heading_too_wide_for_the_panel_starts_at_the_edge(self):
        # Better to run off the right than to start off the left, where the
        # first letters are lost rather than the last.
        ui.block_centred(self.screen, self.shape, "SOMETHING FAR TOO LONG", 0, 6, width=120)

        self.assertEqual(min(rect[1] for rect in _rects(self.screen)), 0)

    def test_a_narrow_panel_centres_within_itself(self):
        ui.block_centred(self.screen, self.shape, "OK", 0, 2, width=100)

        self.assertEqual(blocks.block_top(self.screen, "OK"), 0)
        self.assertTrue(blocks.drew_block_text(self.screen, "OK"))

    def test_every_glyph_is_a_five_by_seven_cell(self):
        for char, glyph in ui._BLOCK_GLYPHS.items():
            self.assertEqual(len(glyph), ui.BLOCK_H, char)
            for row in glyph:
                self.assertEqual(len(row), ui.BLOCK_W, char)


class TestSmallFurniture(unittest.TestCase):
    def setUp(self):
        self.screen = FakeScreen()
        self.shape = FakeShape()

    def test_a_rule_is_a_hairline_across_what_it_separates(self):
        ui.rule(self.screen, self.shape, 8, 30, 304)

        self.assertEqual(_rects(self.screen), [("rect", 8, 30, 304, 1)])

    def test_a_rule_can_be_asked_for_more_weight(self):
        ui.rule(self.screen, self.shape, 0, 0, 10, t=3)

        self.assertEqual(_rects(self.screen), [("rect", 0, 0, 10, 3)])

    def test_a_marker_is_a_stub_down_the_side_of_one_row(self):
        ui.marker(self.screen, self.shape, 4, 40, 18)

        self.assertEqual(_rects(self.screen), [("rect", 4, 40, 3, 18)])

    def test_a_marker_can_be_made_thicker(self):
        ui.marker(self.screen, self.shape, 0, 0, 10, w=6)

        self.assertEqual(_rects(self.screen), [("rect", 0, 0, 6, 10)])

    def test_a_chevron_is_a_stack_of_runs_two_cells_wider_each_row(self):
        ui.chevron(self.screen, self.shape, 160, 200, up=False)

        widths = [rect[3] for rect in _rects(self.screen)]
        self.assertEqual(sorted(widths), [1, 3, 5, 7])

    def test_a_chevron_is_centred_on_the_x_it_is_given(self):
        ui.chevron(self.screen, self.shape, 160, 200, up=True, size=4)

        for rect in _rects(self.screen):
            centre = rect[1] + rect[3] // 2
            self.assertEqual(centre, 160)

    def test_the_two_chevrons_are_mirror_images(self):
        ui.chevron(self.screen, self.shape, 100, 0, up=True, size=4)
        upward = _rects(self.screen)

        other = FakeScreen()
        ui.chevron(other, self.shape, 100, 0, up=False, size=4)
        downward = _rects(other)

        flipped = [("rect", x, 3 - y, w, h) for _, x, y, w, h in downward]
        self.assertEqual(sorted(upward), sorted(flipped))

    def test_a_bigger_chevron_is_taller_and_wider(self):
        ui.chevron(self.screen, self.shape, 0, 0, up=True, size=6)

        rects = _rects(self.screen)
        self.assertEqual(len(rects), 6)
        self.assertEqual(max(rect[3] for rect in rects), 11)

    def test_a_blinking_thing_is_lit_for_the_first_half_of_its_period(self):
        self.assertTrue(ui.blink(0))
        self.assertTrue(ui.blink(499))
        self.assertFalse(ui.blink(500))
        self.assertFalse(ui.blink(999))
        self.assertTrue(ui.blink(1000))

    def test_a_faster_blink_turns_over_sooner(self):
        # The same tick is still lit at the default period and already dark at
        # a shorter one.
        self.assertTrue(ui.blink(150))
        self.assertFalse(ui.blink(150, period=100))
        self.assertTrue(ui.blink(250, period=100))


class TestPalette(unittest.TestCase):
    def test_the_qr_card_is_pure_white_on_pure_black(self):
        # Contrast is what a phone camera needs; this is the one element where
        # matching the rest of the screen matters less than scanning.
        palette = ui.Palette(FakeColor())

        self.assertEqual(palette.card, (255, 255, 255))
        self.assertEqual(palette.ink, (0, 0, 0))

    def test_the_page_is_near_black_rather_than_black(self):
        palette = ui.Palette(FakeColor())

        self.assertEqual(palette.bg, (23, 23, 23))

    def test_the_busyness_ramp_runs_quietest_to_busiest(self):
        palette = ui.Palette(FakeColor())

        levels = [step[0] for step in palette.ramp]
        self.assertEqual(levels, sorted(levels))
        self.assertEqual(len(palette.ramp), 4)

    def test_a_screen_can_be_handed_a_palette_rather_than_building_one(self):
        palette = ui.Palette(FakeColor())
        view = ui.PairingScreen(FakeScreen(), FakeShape(), FakeColor(), palette=palette)

        self.assertIs(view.palette, palette)


if __name__ == "__main__":
    unittest.main()
