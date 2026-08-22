# The picture cache: what it fetches, what it refuses, and what it keeps.
#
# The refusals are the interesting half. A badge that draws whatever bytes it
# is pointed at is a badge that can be pointed anywhere, so the host check and
# the size cap are the tests worth having.

import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from testing import fakes  # noqa: F401,E402  installs runtime stubs

from sb import images  # noqa: E402

GATEWAY = "https://gateway.example.com/functions/v1"
IMAGE_URL = "https://gateway.example.com/storage/v1/object/public/pages/p-1?v=17"
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


class FakeResponse:
    def __init__(self, status_code=200, content=PNG):
        self.status_code = status_code
        self.content = content
        self.closed = False

    def close(self):
        self.closed = True


class Recorder:
    """Stands in for urequests. Records what was asked for."""

    def __init__(self, response=None):
        self.calls = []
        self._response = response if response is not None else FakeResponse()

    def get(self, url):
        self.calls.append(url)
        if isinstance(self._response, Exception):
            raise self._response
        return self._response


class ImageCache(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self._cache_dir = images.CACHE_DIR
        images.CACHE_DIR = os.path.join(self.tmp, "images")

        self._requests = images.requests
        self.recorder = Recorder()
        images.requests = self.recorder

        # verify_peer is exercised by test_net; here it must not fail a fetch
        # that has nothing to do with pinning.
        self._verify = images.net.verify_peer
        images.net.verify_peer = lambda cfg, response: None

    def tearDown(self):
        images.CACHE_DIR = self._cache_dir
        images.requests = self._requests
        images.net.verify_peer = self._verify
        shutil.rmtree(self.tmp, ignore_errors=True)

    def cfg(self):
        return {"gateway": GATEWAY}

    def test_a_picture_is_downloaded_and_left_on_disk(self):
        path = images.fetch(IMAGE_URL, cfg=self.cfg())

        self.assertTrue(os.path.exists(path))
        with open(path, "rb") as f:
            self.assertEqual(f.read(), PNG)

    def test_the_second_ask_costs_no_request(self):
        # The url only changes when the picture does, so a hit is the common
        # case and it must not touch the radio.
        images.fetch(IMAGE_URL, cfg=self.cfg())
        images.fetch(IMAGE_URL, cfg=self.cfg())

        self.assertEqual(len(self.recorder.calls), 1)

    def test_a_replaced_picture_is_a_different_file(self):
        # The gateway stamps the url, so the same object at a new time hashes
        # somewhere else rather than hitting the stale copy.
        first = images.fetch(IMAGE_URL, cfg=self.cfg())
        second = images.fetch(IMAGE_URL.replace("v=17", "v=18"), cfg=self.cfg())

        self.assertNotEqual(first, second)
        self.assertEqual(len(self.recorder.calls), 2)

    def test_a_url_on_another_host_is_refused_before_any_request(self):
        with self.assertRaises(images.ImageError):
            images.fetch("https://evil.test/storage/v1/object/public/pages/p-1", cfg=self.cfg())

        self.assertEqual(self.recorder.calls, [], "the badge opened a socket to another host")

    def test_a_host_that_merely_starts_the_same_is_refused(self):
        with self.assertRaises(images.ImageError):
            images.fetch("https://gateway.example.com.evil.test/x", cfg=self.cfg())

        self.assertEqual(self.recorder.calls, [])

    def test_a_picture_too_big_to_decode_is_refused(self):
        images.requests = Recorder(FakeResponse(content=b"0" * 4096))

        with self.assertRaises(images.ImageError):
            images.fetch(IMAGE_URL, cfg=self.cfg(), max_bytes=1024)

        self.assertIsNone(images.cached(IMAGE_URL), "a refused picture was left on disk")

    def test_a_failed_download_leaves_nothing_behind(self):
        images.requests = Recorder(FakeResponse(status_code=404, content=b""))

        with self.assertRaises(images.ImageError):
            images.fetch(IMAGE_URL, cfg=self.cfg())

        self.assertIsNone(images.cached(IMAGE_URL))

    def test_an_unreachable_host_is_an_image_error_and_not_a_crash(self):
        images.requests = Recorder(OSError("no route"))

        with self.assertRaises(images.ImageError):
            images.fetch(IMAGE_URL, cfg=self.cfg())

    def test_the_cache_does_not_grow_without_end(self):
        # The flash is small and a badge runs for days.
        for n in range(images.MAX_CACHED + 4):
            images.requests = Recorder()
            images.fetch(IMAGE_URL.replace("v=17", "v=%d" % n), cfg=self.cfg())

        self.assertLessEqual(len(os.listdir(images.CACHE_DIR)), images.MAX_CACHED)


if __name__ == "__main__":
    unittest.main()
