# Pictures, fetched once and kept on the badge.
#
# The gateway hands out absolute urls for the pictures on questions and on
# profiles. They live on the same host as the gateway, which is the only reason
# this is allowed to exist: the certificate pin the SDK already holds covers
# them, so fetching one is not a second trust decision.
#
# No Authorization header. These objects are public by design, and sending the
# badge token to a path that does not need it would widen where a scoped
# credential can be observed for nothing in return.
#
# The file has to land on disk before it can be drawn, because BadgeOS's
# image.load takes a path and there is no way to build an image from a buffer
# in memory. /system is read-only, so the cache lives on the writable flash
# beside the token.

import os

try:
    import urequests as requests
except ImportError:  # pragma: no cover - CPython, for the tests
    import requests

from sb import net

CACHE_DIR = "/badge/images"

# A picture that will not fit in memory is worse than no picture: the decode
# fails somewhere inside the firmware rather than here.
#
# 128 KB, down from 512. The badge holds the whole file before it decodes it,
# over badge WiFi, on a battery, and half a megabyte was tens of
# seconds of "Connecting" before anything appeared. Everything the server
# stores for a badge is converted to a palette PNG at the size it will be
# drawn, which lands in single-digit kilobytes, so this is a backstop rather
# than a limit anything should approach.
MAX_IMAGE_BYTES = 128 * 1024

# How many pictures to keep. A desk shows a handful of pages, so this holds a
# whole refresh with room to spare, and the flash is small enough that
# unbounded would eventually fill it.
MAX_CACHED = 16


class ImageError(Exception):
    """The picture did not arrive. Callers draw the question without it."""


def _name_for(url):
    """A filename for a url, which is a hash and not the url itself.

    Urls carry a query string, a length, and characters a FAT filesystem will
    not take. The stamp the gateway puts in the query is part of what is
    hashed, so a replaced picture is a different file rather than a stale hit
    on the same one."""
    digest = net._hexdigest(url.encode("utf-8"))
    if not digest:
        # No hashlib on this firmware. Naming the cause beats the TypeError
        # that slicing None would have raised three frames later.
        raise ImageError("no hashlib")
    return digest[:24] + ".png"


def path_for(url):
    return CACHE_DIR + "/" + _name_for(url)


def cached(url):
    """The path this picture is already at, or None."""
    if not url:
        return None
    try:
        path = path_for(url)
    except ImageError:
        return None
    try:
        os.stat(path)
        return path
    except OSError:
        return None


def fetch(url, cfg=None, max_bytes=MAX_IMAGE_BYTES):
    """Download a picture and return the path it landed at.

    Returns the cached path without a request when there is one, which is the
    common case: the url only changes when the picture does.
    """
    if not url:
        raise ImageError("no url")

    hit = cached(url)
    if hit:
        return hit

    if cfg is None:
        cfg = net.load_config()

    _verify_host(cfg, url)

    try:
        response = requests.get(url)
    except Exception as e:
        raise ImageError(str(e))

    try:
        net.verify_peer(cfg, response)
        status = response.status_code
        body = response.content if status == 200 else b""
    finally:
        response.close()

    if status != 200:
        raise ImageError("http_%d" % status)
    if not body:
        raise ImageError("empty")
    if len(body) > max_bytes:
        raise ImageError("too big: %d bytes" % len(body))

    return _store(url, body)


def _verify_host(cfg, url):
    """The picture must be on the host the badge is already pinned to.

    The url arrives from the gateway rather than from a wearer, so this is not
    guarding against a hostile input so much as against a misconfiguration that
    would quietly send a badge to fetch bytes from somewhere nobody vetted."""
    gateway = (cfg or {}).get("gateway") or ""
    origin = _origin(gateway)
    # Compared whole, not as a prefix. `startswith` would accept
    # gateway.example.com.evil.test, which is a different host that happens to
    # begin with the right letters.
    if not origin or _origin(url) != origin:
        raise ImageError("off-host image url")


def _origin(url):
    """Scheme and host, without the path. Empty for anything unparseable."""
    parts = url.split("/")
    if len(parts) < 3:
        return ""
    return parts[0] + "//" + parts[2]


def _store(url, body):
    net._ensure_dir(CACHE_DIR)
    path = path_for(url)
    temp = path + ".part"

    # Written to a temporary name and moved, so a badge that loses power
    # mid-write leaves no half a PNG for image.load to choke on.
    with open(temp, "wb") as f:
        f.write(body)
    net._replace(temp, path)

    _prune()
    return path


def _prune():
    """Keep the newest MAX_CACHED files.

    Oldest-first by modification time, which on a badge is close enough to
    least-recently-used: a picture is written when it is first drawn and the
    ones that fall off the end are from rounds that have finished."""
    try:
        names = os.listdir(CACHE_DIR)
    except OSError:
        return
    if len(names) <= MAX_CACHED:
        return

    stamped = []
    for name in names:
        full = CACHE_DIR + "/" + name
        try:
            stamped.append((os.stat(full)[8], full))
        except OSError:
            continue

    stamped.sort()
    for _, full in stamped[: len(stamped) - MAX_CACHED]:
        try:
            os.remove(full)
        except OSError:
            pass
