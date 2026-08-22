"""badge-sdk: the client surface applets use.

MicroPython on device, CPython under test and in the emulator. Applets never
import requests or network directly; all networking goes through here.

Certificate pinning and its residual gap
----------------------------------------
config.json carries "cert_sha256", the sha256 of the gateway's DER-encoded
leaf certificate. Where the port exposes the peer certificate (a socket with
getpeercert on the response object), every request fingerprints it and
compares against the pin in constant time, raising CertificateError on
mismatch.

Stock MicroPython urequests does not expose the peer certificate and does not
verify anything, so on such a port there is no protection at all. The residual
gap is real and has two parts:

1. When the peer certificate cannot be reached, this module falls back to
   whatever verification the port itself performs, which on an unmodified
   urequests build is none. Set "require_pin": true in config.json to fail
   closed instead: unverifiable becomes CertificateError rather than a silent
   plaintext-equivalent request. A build that bundles an issuing CA and
   verifies is the intended non-pinned fallback, and it does not exist yet.

2. Even on a port that does expose the certificate, urequests completes the
   handshake and sends the request (including the Authorization header)
   before this module can inspect anything. A pin mismatch therefore means
   the badge token has already been shown to the peer. The token is scoped
   and revocable by design, which is the backstop; treat any
   CertificateError as a reason to re-pair the badge.
"""

import json

__version__ = "1.0.0"

try:
    import requests  # MicroPython 'requests' (aka urequests)
except ImportError:
    try:
        import urequests as requests
    except ImportError:
        # Neither name exists off a badge. Importing sb.constants must not
        # need an HTTP client, so this is deferred to the call rather than
        # refused here: an app that only draws has no reason to fail to start,
        # and a test that only wants the constants has no reason to fake one.
        requests = None

try:
    import hashlib
except ImportError:  # some ports only ship the micro variant
    try:
        import uhashlib as hashlib
    except ImportError:
        hashlib = None

_CFG = None
_TOKEN = None
_APP_SLUG = None
# config.json ships on the read-only /system drive; the token is written at
# pairing time to /state. This MUST equal net.TOKEN_PATH: net/pairing write the
# token, this reads it, and if they disagree the badge pairs and instantly reads
# "not paired". A test pins them equal.
_CONFIG_PATH = "/system/badge/config.json"
_TOKEN_PATH = "/state/token.json"


class SdkError(Exception):
    pass


class NotPaired(SdkError):
    pass


class NotConnected(SdkError):
    pass


class RateLimited(SdkError):
    def __init__(self, retry_after):
        super().__init__("rate limited, retry after %ss" % retry_after)
        self.retry_after = retry_after


class NetworkError(SdkError):
    pass


class CertificateError(SdkError):
    """The gateway certificate did not match the pin, or could not be
    checked while config.json required pinning."""

    pass


class NotFound(SdkError):
    """The addressed resource has no value. Distinct from NotPaired and
    NotConnected so an applet can tell 'nothing stored' from 'revoked'."""

    pass


class Conflict(SdkError):
    """The server has already recorded a different answer from this badge.

    Its own type because a badge on flaky WiFi retries constantly and the
    apps that write have to tell three failures apart: a request that never
    arrived, one the server refused, and one it had already applied. Only the
    first is worth resending, and before this a 409 arrived as a bare SdkError
    that read exactly like the other two."""

    pass


_UNRESERVED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
_SLUG_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789-"
# Same ceiling the server applies alongside the character rule.
_SLUG_MAX = 64


def _quote(value):
    """Percent-encode a query component. MicroPython has no dependable
    urllib.parse.quote, and an unencoded &, =, # or space lets a value
    reshape the URL the gateway sees."""
    if not isinstance(value, str):
        value = str(value)
    out = []
    for ch in value:
        if ch in _UNRESERVED:
            out.append(ch)
        else:
            for byte in ch.encode("utf-8"):
                out.append("%%%02X" % byte)
    return "".join(out)



def _retry_after(payload, default=5):
    """Read the top-level retry_after of a 429 body. A list, a string or a
    junk value must still yield a usable RateLimited, never AttributeError."""
    if not isinstance(payload, dict):
        return default
    try:
        return int(payload.get("retry_after", default))
    except (TypeError, ValueError):
        return default


def _hexdigest(data):
    if hashlib is None:
        return None
    try:
        digest = hashlib.sha256(data).digest()
    except Exception:
        return None
    return "".join("%02x" % b for b in digest)


def _consteq(a, b):
    """Compare fingerprints without leaking a match prefix through timing."""
    if len(a) != len(b):
        return False
    diff = 0
    for i in range(len(a)):
        diff |= ord(a[i]) ^ ord(b[i])
    return diff == 0


def _peer_cert(response):
    """Return the peer certificate in DER form, or None where the port
    cannot expose it. Stock urequests cannot; ports that keep the SSLSocket
    on the response can."""
    sock = getattr(response, "raw", None)
    if sock is None:
        sock = getattr(response, "sock", None)
    if sock is None:
        return None
    getter = getattr(sock, "getpeercert", None)
    if getter is None:
        return None
    try:
        cert = getter(True)
    except TypeError:
        try:
            cert = getter()
        except Exception:
            return None
    except Exception:
        return None
    return cert if cert else None


def _verify_peer(cfg, response):
    """Enforce certificate pinning as far as the port allows. Raises
    CertificateError on mismatch, and on an unverifiable peer when
    cfg["require_pin"] is set.

    Took a pin_key argument while the catalog CDN was a second host with its
    own certificate. The gateway is now the only host a badge talks to, so
    there is one pin."""
    expected = cfg.get("cert_sha256")
    required = bool(cfg.get("require_pin"))
    cert = _peer_cert(response)
    if cert is None:
        if required:
            raise CertificateError("peer certificate unavailable and pinning is required")
        return
    if not expected:
        if required:
            raise CertificateError("pinning is required but cert_sha256 is not configured")
        return
    actual = _hexdigest(cert)
    if actual is None:
        if required:
            raise CertificateError("sha256 unavailable on this port and pinning is required")
        return
    if not _consteq(actual, expected.lower()):
        raise CertificateError("gateway certificate does not match the pin")


def _load_config():
    """config.json only. Separate from _load because the pin check needs the
    gateway config but no badge token."""
    global _CFG
    if _CFG is None:
        with open(_CONFIG_PATH) as f:
            _CFG = json.load(f)
    return _CFG


def _load():
    global _TOKEN
    _load_config()
    if _TOKEN is None:
        _migrate_legacy_token()
        try:
            with open(_TOKEN_PATH) as f:
                _TOKEN = json.load(f)
        except OSError:
            raise NotPaired("badge is not paired")
    return _CFG, _TOKEN


def _migrate_legacy_token():
    # A badge paired by an older build kept its token at /badge. net owns the
    # move to /state; call it so a sync after an SDK update still finds it.
    try:
        from sb import net

        net._migrate_token(_TOKEN_PATH)
    except Exception:
        pass



def _set_app_slug(slug):
    global _APP_SLUG
    _APP_SLUG = slug


def _set_paths(config_path, token_path):
    global _CONFIG_PATH, _TOKEN_PATH, _CFG, _TOKEN
    _CONFIG_PATH = config_path
    _TOKEN_PATH = token_path
    _CFG = None
    _TOKEN = None


def _reset():
    global _CFG, _TOKEN, _APP_SLUG
    _CFG = None
    _TOKEN = None
    _APP_SLUG = None


def _request(method, path, params=None, body=None):
    cfg, tok = _load()
    url = cfg["gateway"].rstrip("/") + path
    if params:
        q = "&".join("%s=%s" % (_quote(k), _quote(v)) for k, v in params.items())
        url += "?" + q
    headers = {
        "Authorization": "Bearer " + tok["badge_token"],
        "X-App-Slug": _APP_SLUG or "unknown",
        "Content-Type": "application/json",
    }
    if requests is None:
        raise NetworkError("this system has no HTTP client")

    try:
        r = requests.request(
            method, url, headers=headers, data=json.dumps(body) if body is not None else None
        )
    except Exception as e:
        raise NetworkError(str(e))
    try:
        # Pin check runs before the body is read so a mismatched peer never
        # gets to feed an applet data. See the module docstring for what this
        # cannot cover.
        _verify_peer(cfg, r)
        status = r.status_code
        payload = r.json() if r.content else {}
    finally:
        r.close()
    if status == 200:
        return payload
    err = payload.get("error") if isinstance(payload, dict) else None
    if status == 401:
        raise NotPaired(err or "unauthorized")
    if status == 404 and err == "not_connected":
        raise NotConnected(err)
    if status == 404 and err in (None, "not_found"):
        raise NotFound(err or "not_found")
    if status == 409:
        raise Conflict(err or "already answered")
    if status == 429:
        raise RateLimited(_retry_after(payload))
    raise SdkError(err or ("http_%d" % status))


def _power_params(power):
    """Battery readings as query parameters, or None.

    A reading the badge could not take is dropped rather than sent as null: the
    gateway records what it is given, and a column full of nulls from a badge
    with no battery sensor is worse than no rows."""
    if not power:
        return None
    return {k: v for k, v in power.items() if v is not None}


def desk(power=None):
    """GET /gateway/desk. The only route either app calls.

    `power` is an optional dict of battery readings sent as query parameters.
    It is the only thing the badge tells the server about itself.
    """
    return _request("GET", "/gateway/desk", _power_params(power))
