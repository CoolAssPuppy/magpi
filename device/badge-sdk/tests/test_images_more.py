# What the picture cache does when the drive or the firmware is against it.
#
# test_images.py covers the fetch and the two refusals. These are the paths a
# badge takes when there is nothing to name a file with, nothing in the
# response, or a cache directory that will not answer: a picture is worth a
# blank space on a page and never a crashed applet, so every one of these has
# to end as an ImageError or a quiet success.

import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
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
        return self._response


class CacheDrive:
    """The os module as images uses it, with one call made to fail.

    A badge's flash is not a laptop's disk: a listing can fail, a name can be
    gone by the time it is stat'd, and a remove can be refused. Each of those
    is a real state and none of them may take a picture down with it."""

    def __init__(self, listdir_error=None, phantom=None, remove_error=None):
        self._listdir_error = listdir_error
        self._phantom = phantom
        self._remove_error = remove_error
        self.removed = []

    def stat(self, path):
        return os.stat(path)

    def listdir(self, path):
        if self._listdir_error is not None:
            raise self._listdir_error
        names = os.listdir(path)
        if self._phantom is not None:
            names.append(self._phantom)
        return names

    def remove(self, path):
        if self._remove_error is not None:
            raise self._remove_error
        self.removed.append(path)
        os.remove(path)

    def mkdir(self, path):
        os.mkdir(path)

    def rename(self, source, target):
        os.rename(source, target)


class ImageTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)

        self._cache_dir = images.CACHE_DIR
        images.CACHE_DIR = os.path.join(self.tmp, "images")
        self.addCleanup(lambda: setattr(images, "CACHE_DIR", self._cache_dir))

        self.recorder = Recorder()
        self._requests = images.requests
        images.requests = self.recorder
        self.addCleanup(lambda: setattr(images, "requests", self._requests))

        # Pinning is exercised by test_net; here it must not fail a fetch that
        # has nothing to do with it.
        self._verify = images.net.verify_peer
        images.net.verify_peer = lambda cfg, response: None
        self.addCleanup(lambda: setattr(images.net, "verify_peer", self._verify))

    def cfg(self):
        return {"gateway": GATEWAY}

    def replace_os(self, drive):
        original = images.os
        images.os = drive
        self.addCleanup(lambda: setattr(images, "os", original))
        return drive

    def fill_cache(self, count):
        """Pre-load the cache with files older than anything fetched now."""
        os.makedirs(images.CACHE_DIR, exist_ok=True)
        for index in range(count):
            full = os.path.join(images.CACHE_DIR, "old-%02d.png" % index)
            with open(full, "wb") as f:
                f.write(b"old")
            os.utime(full, (1_000_000 + index, 1_000_000 + index))


class TestWhatCannotBeNamed(ImageTestCase):
    """_name_for hashes the url. A firmware with no sha256 cannot, and the
    cache has to say so rather than slicing None three frames later."""

    def _without_hashing(self):
        original = images.net._hexdigest
        images.net._hexdigest = lambda data: None
        self.addCleanup(lambda: setattr(images.net, "_hexdigest", original))

    def test_a_build_with_no_hashing_cannot_name_a_cache_file(self):
        self._without_hashing()

        with self.assertRaises(images.ImageError) as ctx:
            images.path_for(IMAGE_URL)

        self.assertIn("hashlib", str(ctx.exception))

    def test_a_picture_that_cannot_be_named_is_never_a_cache_hit(self):
        self._without_hashing()

        self.assertIsNone(images.cached(IMAGE_URL))

    def test_a_page_with_no_picture_is_not_a_cache_hit(self):
        # Pages carry an optional image url, so the empty case arrives here on
        # every text-only page rather than being a malformed input.
        self.assertIsNone(images.cached(None))
        self.assertIsNone(images.cached(""))


class TestRefusals(ImageTestCase):
    def test_a_fetch_with_no_url_is_refused_before_any_request(self):
        with self.assertRaises(images.ImageError) as ctx:
            images.fetch("", cfg=self.cfg())

        self.assertIn("no url", str(ctx.exception))
        self.assertEqual(self.recorder.calls, [])

    def test_a_gateway_that_is_not_a_url_puts_every_picture_off_host(self):
        # A misconfigured config.json must not turn into a badge fetching bytes
        # from wherever the string happens to point.
        with self.assertRaises(images.ImageError) as ctx:
            images.fetch(IMAGE_URL, cfg={"gateway": "gateway.example.com"})

        self.assertIn("off-host", str(ctx.exception))
        self.assertEqual(self.recorder.calls, [])

    def test_a_response_with_no_bytes_is_refused(self):
        # A 200 with an empty body is a picture that will not decode, and
        # storing it would cache the failure until the url changes.
        images.requests = Recorder(FakeResponse(content=b""))

        with self.assertRaises(images.ImageError) as ctx:
            images.fetch(IMAGE_URL, cfg=self.cfg())

        self.assertIn("empty", str(ctx.exception))
        self.assertIsNone(images.cached(IMAGE_URL))


class TestConfigOnTheDrive(ImageTestCase):
    def test_a_fetch_without_a_config_reads_the_badges_own(self):
        # Applets call fetch(url) with no config; the gateway host it is pinned
        # to comes off the drive.
        reads = []

        def load_config():
            reads.append(True)
            return self.cfg()

        original = images.net.load_config
        images.net.load_config = load_config
        self.addCleanup(lambda: setattr(images.net, "load_config", original))

        path = images.fetch(IMAGE_URL)

        self.assertTrue(os.path.exists(path))
        self.assertEqual(len(reads), 1)


class TestPruningAgainstABadDrive(ImageTestCase):
    def test_a_cache_directory_that_cannot_be_listed_does_not_fail_the_fetch(self):
        self.replace_os(CacheDrive(listdir_error=OSError("no such directory")))

        path = images.fetch(IMAGE_URL, cfg=self.cfg())

        self.assertTrue(os.path.exists(path))

    def test_a_file_that_vanished_mid_prune_does_not_stop_the_prune(self):
        self.fill_cache(images.MAX_CACHED + 1)
        drive = self.replace_os(CacheDrive(phantom="already-gone.png"))

        path = images.fetch(IMAGE_URL, cfg=self.cfg())

        self.assertLessEqual(len(os.listdir(images.CACHE_DIR)), images.MAX_CACHED)
        self.assertTrue(os.path.exists(path), "the picture just fetched was pruned")
        self.assertNotIn("already-gone.png", [os.path.basename(p) for p in drive.removed])

    def test_a_file_that_will_not_delete_does_not_fail_the_fetch(self):
        # A read-only mount or a file the firmware still holds open. The
        # picture is on disk either way, and the next prune tries again.
        self.fill_cache(images.MAX_CACHED + 1)
        self.replace_os(CacheDrive(remove_error=OSError("read-only filesystem")))

        path = images.fetch(IMAGE_URL, cfg=self.cfg())

        self.assertTrue(os.path.exists(path))


if __name__ == "__main__":
    unittest.main()
