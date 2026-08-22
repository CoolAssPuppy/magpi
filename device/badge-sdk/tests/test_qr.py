import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from testing import fakes  # noqa: F401  (installs runtime stubs)
from sb import qr


# Canonical matrix for "HELLO WORLD" (version 1, error correction low),
# produced by Project Nayuki's qrcodegen reference implementation
# (https://github.com/nayuki/QR-Code-generator, MIT), via:
#
#   QrCode.encode_segments([QrSegment.make_bytes(b"HELLO WORLD")],
#                          QrCode.Ecc.LOW, boostecl=False)
#
# Both arguments matter and an earlier revision of this fixture got them
# wrong, so it asserted against a code qr.py cannot produce:
#
#   - make_bytes, not encode_text. encode_text auto-selects alphanumeric
#     mode for this input; qr.py is byte mode only (see qr.py module
#     docstring), and the two modes pack the data differently.
#   - boostecl=False. The default, True, silently upgrades the error
#     correction level when the payload leaves room for it, so a short
#     string requested at LOW comes back encoded at HIGH.
#
# Rows top to bottom, "1" is a dark module.
HELLO_WORLD_V1 = [
    "111111100101101111111",
    "100000100111001000001",
    "101110101101101011101",
    "101110100101001011101",
    "101110100010101011101",
    "100000100000101000001",
    "111111101010101111111",
    "000000001101100000000",
    "111011111111011000100",
    "100110000010001100010",
    "011111101010110111111",
    "111000010110000010010",
    "110110111010111110100",
    "000000001001010000110",
    "111111101011000110111",
    "100000101001100100001",
    "101110101001001010100",
    "101110100101001110110",
    "101110101000101010101",
    "100000101001000010010",
    "111111101001101100111",
]


class TestQrMatrix(unittest.TestCase):
    def test_short_string_fits_version_one(self):
        m = qr.qr_matrix("HELLO")
        self.assertEqual(len(m), 21)
        for row in m:
            self.assertEqual(len(row), 21)
            for cell in row:
                self.assertIsInstance(cell, bool)

    def test_known_vector_matches_reference(self):
        m = qr.qr_matrix("HELLO WORLD")
        rendered = ["".join("1" if cell else "0" for cell in row) for row in m]
        self.assertEqual(rendered, HELLO_WORLD_V1)

    def test_finder_patterns_at_three_corners(self):
        m = qr.qr_matrix("HELLO")
        size = len(m)

        def assert_finder(x0, y0):
            # 7x7 dark ring with dark 3x3 core and light inner ring.
            for dy in range(7):
                for dx in range(7):
                    dark = max(abs(dx - 3), abs(dy - 3)) != 2
                    self.assertEqual(m[y0 + dy][x0 + dx], dark, "finder at %d,%d" % (x0, y0))

        assert_finder(0, 0)
        assert_finder(size - 7, 0)
        assert_finder(0, size - 7)
        # Separators are light.
        self.assertFalse(m[0][7])
        self.assertFalse(m[7][0])
        self.assertFalse(m[7][7])
        self.assertFalse(m[0][size - 8])
        self.assertFalse(m[7][size - 1])
        self.assertFalse(m[size - 8][0])
        self.assertFalse(m[size - 1][7])

    def test_longer_string_uses_bigger_version(self):
        # 60 bytes needs version 4 at error correction low (78 byte capacity).
        m = qr.qr_matrix("A" * 60)
        self.assertEqual(len(m), 33)

    def test_verification_url_fits_and_scans_shape(self):
        m = qr.qr_matrix("https://badge.example.com/link?code=WXYZ-1234")
        self.assertEqual(len(m), 29)  # version 3, 53 byte capacity at low

    def test_overlong_text_raises(self):
        with self.assertRaises(qr.DataTooLongError):
            qr.qr_matrix("A" * 3000)

    def test_high_error_correction_level(self):
        m = qr.qr_matrix("HELLO", ecl="high")
        self.assertEqual(len(m), 21)


class TestDrawQr(unittest.TestCase):
    def setUp(self):
        self.matrix = qr.qr_matrix("HELLO")
        self.rects = []

    def rect(self, x, y, w, h):
        r = ("rect", x, y, w, h)
        self.rects.append(r)
        return r

    def test_draws_one_rectangle_per_dark_run(self):
        screen = fakes.FakeScreen()
        expected_runs = 0
        for row in self.matrix:
            in_run = False
            for cell in row:
                if cell and not in_run:
                    expected_runs += 1
                in_run = cell
        qr.draw_qr(screen, self.matrix, 0, 0, 1, self.rect)
        shapes = [c for c in screen.calls if c[0] == "shape"]
        self.assertEqual(len(shapes), expected_runs)

    def test_positions_and_scale(self):
        screen = fakes.FakeScreen()
        qr.draw_qr(screen, self.matrix, 10, 20, 4, self.rect)
        # The top-left finder starts with a run of 7 dark modules at (0, 0).
        self.assertIn(("rect", 10, 20, 28, 4), self.rects)
        # The top-right finder starts at x = size - 7, still on row 0.
        self.assertIn(("rect", 10 + (21 - 7) * 4, 20, 28, 4), self.rects)


if __name__ == "__main__":
    unittest.main()
