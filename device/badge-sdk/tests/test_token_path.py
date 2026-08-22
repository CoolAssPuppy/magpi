# The token the badge writes at pairing and the token the public API reads must
# be the same file. When they drifted (writer /state, reader /badge), the badge
# paired and instantly read "not paired", looping back to the QR and refusing to
# relink. This pins reader and writer together so they cannot drift again.

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from testing import fakes  # noqa: F401  (fake requests before sb is imported)
import sb
from sb import net

# Captured at import, before any other suite's setUp calls sb._set_paths and
# mutates the module globals. unittest imports every test module before running
# any test, so these are the shipped defaults, not a test override.
_READER_TOKEN = sb._TOKEN_PATH
_READER_CONFIG = sb._CONFIG_PATH


class TestTokenPath(unittest.TestCase):
    def test_reader_and_writer_agree_on_the_token_location(self):
        # net/pairing write here; sb reads here. If these differ the badge
        # cannot stay paired.
        self.assertEqual(_READER_TOKEN, net.TOKEN_PATH)

    def test_reader_and_writer_agree_on_the_config_location(self):
        self.assertEqual(_READER_CONFIG, net.CONFIG_PATH)

    def test_token_default_is_the_writable_state_dir(self):
        # /system is the read-only FAT drive; the token has to be on writable
        # flash, which is /state.
        self.assertEqual(_READER_TOKEN, "/state/token.json")


if __name__ == "__main__":
    unittest.main()
