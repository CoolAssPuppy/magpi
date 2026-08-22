# The impure half of the pairing flow: WiFi, the two unauthenticated pairing
# calls, and writing the token file. pairing.py owns every rule; this file
# only moves bytes.
#
# Why this applet imports network and requests directly, when no other
# applet may: the SDK reads /state/token.json on every
# call and raises NotPaired when it is missing, which is exactly the state
# this app exists to leave. /device/start and /device/poll are also the
# only two endpoints that take no badge token. So this applet
# brings up its own radio and makes its own two calls. Every other applet,
# and every call after pairing, goes through sb.

import json
import sys

try:
    import network
except ImportError:  # host and emulator
    network = None

try:
    import requests
except ImportError:
    import urequests as requests

try:
    import hashlib
except ImportError:
    try:
        import uhashlib as hashlib
    except ImportError:
        hashlib = None

from sb.pairing import MissingCredentials
from sb.pairing import PairingError
from sb.pairing import WIFI_CONNECTED
from sb.pairing import WIFI_CONNECTING
from sb.pairing import WIFI_FAILED

# BadgeOS keeps secrets.py here. Named rather than inlined so a test can point
# it at a real directory.
SYSTEM_DIR = "/system"

# config.json ships on the drive and is only ever read. Everything the badge
# writes lives on the internal flash instead: /system is a FAT partition the
# firmware mounts read-only to Python so USB mass storage can own it, and a
# write there fails with EROFS no matter how it is mounted. / is littlefs and
# writable, which is the only place a token can survive a reboot.
CONFIG_PATH = "/system/badge/config.json"
# Runtime state lives in /state, the writable location the Badgeware docs name
# for app data (guides/filesystem.md). / is littlefs and writable; /system is
# the read-only FAT drive. Older builds wrote to /badge, so a token found there
# is migrated once (see _migrate_token) rather than stranding a paired badge.
STATE_DIR = "/state"
TOKEN_PATH = STATE_DIR + "/token.json"
LEGACY_TOKEN_PATH = "/badge/token.json"

# The SDK version this applet ships alongside, reported to /device/start so
# the fleet dashboard can tell which badges need a firmware refresh. Read
# from the SDK when it is importable rather than duplicated as a literal;
# importing sb does no IO, it only reads files when a call is made.
try:
    import sb

    SDK_VERSION = getattr(sb, "__version__", "unknown")
except Exception:
    SDK_VERSION = "unknown"


def _migrate_token(path=TOKEN_PATH, legacy=LEGACY_TOKEN_PATH):
    """Move a token an older build wrote to /badge into /state, once.

    A badge paired before the token moved keeps its pairing: the file is
    renamed to the documented location on the next check rather than left where
    a newer SDK would never read it. Best effort, and silent when there is
    nothing to move or the move fails."""
    try:
        import os
    except ImportError:
        return
    try:
        os.stat(path)
        return  # The token is already where it belongs.
    except OSError:
        pass
    try:
        os.stat(legacy)
    except OSError:
        return  # No legacy token to migrate.
    try:
        _ensure_dir(path.rsplit("/", 1)[0] if "/" in path else "")
        os.rename(legacy, path)
    except OSError:
        pass


def is_paired(path=TOKEN_PATH):
    """Whether this badge has already been paired.

    Lives here because this module owns the token file: save_token writes
    it, so the question of what counts as written belongs beside it.

    A file that exists but does not parse, or parses without a badge_token,
    counts as not paired. Treating a truncated or hand-edited token as a
    pairing would send the badge into the sync flow where every gateway call
    fails with an authentication error, and no screen on that path can tell
    the wearer the fix is to pair again."""
    _migrate_token(path)
    try:
        with open(path) as f:
            token = json.load(f)
    except (OSError, ValueError):
        return False
    if not isinstance(token, dict):
        return False
    return bool(token.get("badge_token"))


def firmware_version():
    """Best effort. BadgeOS does not document a firmware version field, so
    this falls back through what MicroPython does expose and finally to a
    string the server can still record."""
    try:
        import os

        return os.uname().release
    except Exception:
        pass
    try:
        import sys

        return ".".join(str(part) for part in sys.implementation.version)
    except Exception:
        return "unknown"


def load_config(path=CONFIG_PATH):
    with open(path) as f:
        return json.load(f)


def _credentials_in(lookup):
    """Pull an ssid and password out of anything that answers to a name.

    The exact variable names are a Pimoroni convention rather than a
    documented contract, so several spellings are accepted."""
    ssid = None
    password = ""
    for name in ("WIFI_SSID", "SSID", "wifi_ssid", "ssid"):
        value = lookup(name)
        if value:
            ssid = value
            break
    for name in ("WIFI_PASSWORD", "PASSWORD", "wifi_password", "password"):
        value = lookup(name)
        if value:
            password = value
            break
    return ssid, password


def _system_secrets():
    """Read SYSTEM_DIR/secrets.py without importing it.

    Importing is not enough on two counts: the installed image puts only the
    running app's own directory on sys.path, and CPython ships a stdlib module
    of the same name that wins on the host and the emulator. Reading the file
    is the only way to get the badge's own copy on both."""
    try:
        with open(SYSTEM_DIR + "/secrets.py") as f:
            source = f.read()
    except OSError:
        return {}
    namespace = {}
    try:
        exec(source, namespace)
    except Exception:
        return {}
    return namespace


def wifi_credentials():
    """Read the SSID and password out of secrets.py.

    secrets.py is edited over USB before the badge leaves the desk."""
    ssid = None
    password = ""

    try:
        import secrets
    except ImportError:
        secrets = None
    if secrets is not None:
        ssid, password = _credentials_in(lambda name: getattr(secrets, name, None))

    if not ssid:
        namespace = _system_secrets()
        if namespace:
            ssid, password = _credentials_in(namespace.get)
            if not ssid:
                raise MissingCredentials("secrets.py has no WIFI_SSID")

    if not ssid:
        raise MissingCredentials("Add secrets.py over USB")
    return ssid, password


def _hexdigest(data):
    if hashlib is None:
        return None
    try:
        return "".join("%02x" % b for b in hashlib.sha256(data).digest())
    except Exception:
        return None


def _consteq(a, b):
    if len(a) != len(b):
        return False
    diff = 0
    for i in range(len(a)):
        diff |= ord(a[i]) ^ ord(b[i])
    return diff == 0


def _peer_cert(response):
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
        # A port whose getpeercert takes no binary_form argument. Without this
        # retry the cert reads as unavailable, which skips the pin when
        # require_pin is unset and fails pairing outright when it is set. The
        # SDK's copy has always had this; the two drifted.
        try:
            cert = getter()
        except Exception:
            return None
    except Exception:
        return None
    return cert if cert else None


def verify_peer(cfg, response):
    """Certificate pinning for the two pairing calls.

    A deliberate copy of the SDK's check rather than an import: pairing
    must work on a badge that has no token, and sb's networking is built
    around having one. The residual gap is identical and is documented in
    full in badge-sdk/sb/__init__.py, in short: stock urequests exposes no
    peer certificate and verifies nothing, so on such a port this is a
    no-op unless config.json sets require_pin, which turns unverifiable
    into a refusal."""
    expected = cfg.get("cert_sha256")
    required = bool(cfg.get("require_pin"))
    cert = _peer_cert(response)
    if cert is None:
        if required:
            raise PairingError("certificate", "peer certificate unavailable, pinning required")
        return
    if not expected:
        if required:
            raise PairingError("certificate", "pinning required but no cert_sha256 configured")
        return
    actual = _hexdigest(cert)
    if actual is None:
        if required:
            raise PairingError("certificate", "sha256 unavailable, pinning required")
        return
    if not _consteq(actual, expected.lower()):
        raise PairingError("certificate", "gateway certificate does not match the pin")


class DevicePort:
    """The PairingMachine port, implemented against real hardware."""

    def __init__(self, config=None, wlan_factory=None):
        self.cfg = config if config is not None else load_config()
        self.base = self.cfg["gateway"].rstrip("/")
        self._wlan_factory = wlan_factory or _default_wlan
        self._wlan = None

    # -- WiFi --------------------------------------------------------------

    def wifi_begin(self):
        ssid, password = wifi_credentials()
        if self._wlan is None:
            self._wlan = self._wlan_factory()
        self._wlan.active(True)
        self._wlan.connect(ssid, password)

    def wifi_status(self):
        if self._wlan is None:
            return WIFI_FAILED
        try:
            if self._wlan.isconnected():
                return WIFI_CONNECTED
        except Exception:
            return WIFI_FAILED
        try:
            status = self._wlan.status()
        except Exception:
            return WIFI_CONNECTING
        # Negative status values are the MicroPython failure codes (wrong
        # password, no AP found, generic fail). Anything else is still in
        # progress; the machine's own timeout catches a stall.
        if isinstance(status, int) and status < 0:
            return WIFI_FAILED
        return WIFI_CONNECTING

    def wifi_reset(self):
        if self._wlan is None:
            return
        try:
            self._wlan.active(False)
        except Exception:
            pass
        self._wlan = None

    # -- pairing calls -----------------------------------------------------

    def start(self, badge_uid, fw, sdk):
        return self._post(
            "/device-start",
            {"badge_uid": badge_uid, "fw": fw, "sdk": sdk},
            accept=(200, 201),
        )

    def poll(self, device_code):
        return self._post("/device-poll", {"device_code": device_code}, accept=(200,))

    def _post(self, path, body, accept):
        try:
            response = requests.request(
                "POST",
                self.base + path,
                headers={"Content-Type": "application/json"},
                data=json.dumps(body),
            )
        except Exception as e:
            raise PairingError("network", str(e))
        try:
            verify_peer(self.cfg, response)
            status = response.status_code
            payload = response.json() if response.content else {}
        except PairingError:
            raise
        except Exception as e:
            raise PairingError("network", str(e))
        finally:
            response.close()

        if status in accept:
            if not isinstance(payload, dict):
                raise PairingError("bad_response", "expected an object")
            return payload
        if not isinstance(payload, dict):
            raise PairingError("http_%d" % status)
        raise PairingError(
            payload.get("error") or ("http_%d" % status),
            payload.get("message"),
            # Top level, not under detail: that is where the gateway puts
            # it, and reading it from detail means every backoff the server
            # asks for is silently ignored.
            payload.get("retry_after"),
        )

    # -- persistence and handoff ------------------------------------------

    def save_token(self, token, path=TOKEN_PATH):
        """Write the token file the SDK reads.

        Written to a sibling temp path and renamed, so a reset mid-write
        leaves either the old file or the new one and never a truncated
        one that would read as a corrupt pairing."""
        _ensure_dir(path.rsplit("/", 1)[0] if "/" in path else "")
        temp = path + ".tmp"
        with open(temp, "w") as f:
            f.write(json.dumps(token))
        _replace(temp, path)

    def launch(self):
        """Formerly the hand-off. Now a no-op, deliberately.

        This called machine.soft_reset() inside a bare except, on the reasoning
        that a reset was "the one mechanism that is certain to work". It was
        not: on the badge nothing happened, the exception was swallowed, and a
        wearer whose token had already been written sat looking at the pairing
        code until they left for the launcher and opened the app again.

        BadgeApp hands off to itself now (see _update_pairing), which needs no
        reset and no launcher entry point. Kept as a seam because PairingPort
        is a documented interface and a port is free to do something here.
        """
        return None


def forget_token(path=TOKEN_PATH):
    """Delete the stored pairing.

    Beside save_token because this module owns the file. Called when the
    gateway says the badge is no longer paired: the token names a badge that
    no longer exists, so keeping it only guarantees the same 401 on every
    later open. Clears the legacy /badge location too, so a badge paired by an
    older build is not left with a stale token that migration would revive."""
    removed = False
    try:
        import os
    except ImportError:
        return False
    for target in (path, LEGACY_TOKEN_PATH):
        try:
            os.remove(target)
            removed = True
        except OSError:
            # Already gone, or a read-only mount. Nothing to forget there.
            pass
    return removed


def _ensure_dir(path):
    if not path:
        return
    try:
        import os

        parts = [p for p in path.split("/") if p]
        built = ""
        for part in parts:
            built += "/" + part
            try:
                os.mkdir(built)
            except OSError:
                pass
    except ImportError:
        pass


def _replace(temp, path):
    import os

    try:
        os.remove(path)
    except OSError:
        pass
    os.rename(temp, path)


def _default_wlan():
    if network is None:
        raise MissingCredentials("no network interface on this build")
    return network.WLAN(network.STA_IF)


__all__ = [
    "DevicePort",
    "SDK_VERSION",
    "WIFI_CONNECTED",
    "WIFI_CONNECTING",
    "WIFI_FAILED",
    "firmware_version",
    "load_config",
    "verify_peer",
    "wifi_credentials",
]
