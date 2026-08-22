# Response and socket doubles for the pin check, shared by test_net_more and
# test_sb_more.
#
# net.py and sb/__init__.py each carry their own copy of the check (pairing
# runs before there is a token, and the SDK is built around having one), so the
# same set of awkward ports has to be pointed at both.
#
# Not a test module. Named with a leading underscore so unittest discovery
# ignores it.


class Response:
    """A response the shared fakes cannot build: a port whose socket answers
    differently, or a body that does not parse."""

    def __init__(self, status_code=200, payload=None, content=b"{}", sock=None, json_error=None):
        self.status_code = status_code
        self.content = content
        self.closed = False
        self._payload = payload if payload is not None else {}
        self._json_error = json_error
        if sock is not None:
            self.raw = sock

    def json(self):
        if self._json_error is not None:
            raise self._json_error
        return self._payload

    def close(self):
        self.closed = True


class SocketWithoutACertificate:
    """A port that keeps a socket on the response but offers no way to read
    the peer certificate."""


class SocketWithACertificate:
    """The ordinary case: getpeercert(binary_form=True) returns DER bytes."""

    def __init__(self, cert):
        self._cert = cert

    def getpeercert(self, binary_form=False):
        return self._cert


class OlderPortSocket:
    """getpeercert without the binary_form argument, which is how some ports
    ship it. The check has to retry rather than read the peer as unavailable."""

    def __init__(self, cert):
        self._cert = cert

    def getpeercert(self):
        return self._cert


class SocketThatNeverAnswers:
    """Refuses the argument, and then refuses outright."""

    def getpeercert(self, *args):
        if args:
            raise TypeError("getpeercert() takes no arguments")
        raise ValueError("socket already closed")


class SocketThatRaises:
    def getpeercert(self, *args):
        raise ValueError("socket already closed")


class HashlibThatFails:
    """A firmware whose sha256 is present but cannot run: no memory, or a
    port that ships the name and not the implementation."""

    def sha256(self, data):
        raise ValueError("out of memory")
