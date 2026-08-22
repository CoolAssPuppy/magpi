# Poller gates slow network work onto an interval so update() never
# refetches every frame. The fetch itself still blocks for its duration;
# keep intervals generous (10 to 30 seconds) and payloads small.
#
# Consecutive failures back off exponentially. A gateway that is down,
# rate limiting, or unreachable must not be retried at the healthy interval
# by every badge at once.
_DEFAULT_MAX_BACKOFF_MS = 300000
_MAX_DOUBLINGS = 16


class Poller:
    def __init__(self, fn, interval_ms=5000, max_backoff_ms=_DEFAULT_MAX_BACKOFF_MS):
        self.fn = fn
        self.interval = interval_ms
        self.max_backoff = max(interval_ms, max_backoff_ms)
        self.last = -(10**9)
        self.value = None
        self.error = None
        self.loading = True
        self.errors = 0
        self.retry_after_ms = 0

    def delay(self):
        """Milliseconds to wait before the next fetch."""
        if self.errors == 0:
            return self.interval
        backoff = self.interval * (2 ** min(self.errors, _MAX_DOUBLINGS))
        if backoff > self.max_backoff:
            backoff = self.max_backoff
        # A server-supplied retry_after is a floor, not a replacement: honour
        # it when it is longer than the backoff we already computed.
        if self.retry_after_ms > backoff:
            return self.retry_after_ms
        return backoff

    def tick(self, now_ms):
        if now_ms - self.last >= self.delay():
            self.last = now_ms
            try:
                self.value = self.fn()
                self.error = None
                self.errors = 0
                self.retry_after_ms = 0
            except Exception as e:
                self.error = e
                self.errors += 1
                self.retry_after_ms = _retry_after_ms(e)
            finally:
                self.loading = False
        return self.value


def _retry_after_ms(error):
    """RateLimited carries retry_after in seconds. Any other exception, or a
    junk value on one, contributes nothing."""
    seconds = getattr(error, "retry_after", None)
    try:
        return max(0, int(seconds)) * 1000
    except (TypeError, ValueError):
        return 0
