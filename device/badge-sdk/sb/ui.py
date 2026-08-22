# Drawing for the pairing flow. Knows nothing about pairing rules: it is handed a
# PairingMachine and renders whatever state it is in.
#
# The screen is 320 by 240 and the reader is standing at a table, so the
# layout gives the QR and the short code the whole screen between them. The
# short code is not a caption; it is the fallback for every phone camera
# that will not focus on a 150 pixel QR, so it gets the same weight.

from sb import brand
from sb import qr
from sb.pairing import (
    STATE_APPROVED,
    STATE_CONNECTING,
    STATE_DENIED,
    STATE_DONE,
    STATE_ERROR,
    STATE_EXPIRED,
    STATE_NO_CREDENTIALS,
    STATE_NO_NETWORK,
    STATE_STARTING,
    STATE_WAITING,
)

WIDTH = 320
HEIGHT = 240
MARGIN = 8

# Two centered lines at the top: who this is, then what to do. The prompt used
# to explain what the scan was for, which is the app describing itself to
# someone already holding it.
WELCOME = "Magpi"
PROMPT = "Scan to set up at magpi.app"

# Mark and welcome on one centered line, prompt centered under it.
LOGO_H = 22
LOGO_GAP = 8
PROMPT_H = 12
HEADER_H = MARGIN - 2 + LOGO_H + 4 + PROMPT_H
PROMPT_MAX_SIZE = 16
PROMPT_MIN_SIZE = 4

# ROM fonts are fixed size. Passing a size while a ROM font is active is
# silently ignored, not an error (firmware hardware_test.py does it; the docs
# are wrong), so picking a font is the only way to change size. ROM widths:
#
#   ark 11 tall   sins 12   badgeware 14   memo 15   smart 16   badgewaremax 20
#
# badgeware sets the welcome 313 wide, over the mark, so welcome takes smart.
FONT_WELCOME = "smart"
FONT_PROMPT = "sins"
FONT_CODE = "badgewaremax"
FONT_SMALL = "ark"

# Stacked, not side by side: header, then the QR centered in what is left,
# then the code across the bottom. The code gets the full width down there, so
# it reads as one line rather than being broken to fit a narrow column.
#
# The bands are sized so the QR band stays at least 148, which is scale 4 for a
# 29 module code. At 136 it drops to scale 3 and loses a third of its size.
CODE_H = 22
TIMER_H = 16
CODE_COL_W = WIDTH - MARGIN * 2
QR_BOX = WIDTH

# Quiet zone in modules. Four is what ISO 18004 requires; scanners get
# unreliable below it and this is the one place where being frugal with
# pixels costs a scan.
QUIET = 4

CODE_MAX_SIZE = 90
CODE_MIN_SIZE = 6
BODY_SIZE = 6


def rom_font_named(name):
    """A ROM font by name, or None where there is no rom_font.

    rom_font is a BadgeOS global rather than an import, so it does not exist
    under test or in the emulator. Callers leave the font alone when this
    returns None, which is what keeps the drawing code host-safe.

    AttributeError is caught alongside NameError: rom_font exists on the badge
    but a firmware that lacks a named font raises AttributeError, and a missing
    font must degrade to the current one, not crash the screen."""
    try:
        return getattr(rom_font, name)  # noqa: F821
    except (NameError, AttributeError):
        return None


# The pairing code is what someone reads out or types when a camera will not
# focus on the QR, so it is the one string on this screen that has to be
# legible at arm's length. Every ROM font is a fixed size and the largest tops
# out at 20 pixels tall, which is why fit_size could never fill the band it is
# given. A vector font honours the size argument, so the code grows to the
# space instead of sitting small in the middle of it.
CODE_FONT_PATH = "/system/assets/fonts/MonaSans-Medium.af"

_vector_fonts = {}


def vector_font_at(path):
    """A vector font by path, or None where it cannot be loaded.

    Cached: font.load reads and parses a file, and the draw loop asks for the
    same font every frame. picovector is a BadgeOS module and the font lives
    on /system, so neither exists under test; returning None leaves the caller
    on its ROM font, which is what keeps the drawing code host-safe."""
    if path in _vector_fonts:
        return _vector_fonts[path]
    loaded = None
    try:
        from picovector import font

        loaded = font.load(path)
    except Exception:
        # A missing module off-device, or a missing file on an older BadgeOS.
        # Neither is worth failing a pairing screen over.
        loaded = None
    _vector_fonts[path] = loaded
    return loaded


def format_remaining(seconds):
    """Time left as m:ss. "595s left" makes a reader do arithmetic to find out
    whether they have time to get their phone out."""
    if seconds is None:
        return ""
    seconds = max(0, int(seconds))
    return "%d:%02d left" % (seconds // 60, seconds % 60)


def fit_size(measure, text, max_w, max_h, max_size=CODE_MAX_SIZE, min_size=CODE_MIN_SIZE):
    """Largest text size at which `text` fits the box. Steps down rather
    than solving for it: measure_text is not linear in size on the badge's
    vector fonts, so a computed ratio overflows the column."""
    size = max_size
    while size > min_size:
        width, height = measure(text, size)
        if width <= max_w and height <= max_h:
            return size
        size -= 1
    return min_size


def qr_layout(modules, box_x, box_y, box_w, box_h, quiet=QUIET):
    """Scale and origin for a QR of `modules` modules inside a box.

    Returns (scale, x, y, side): scale is pixels per module, x and y are
    where the first dark module starts, and side is the full width of the
    light card including the quiet zone. Scale is a whole number of pixels
    because a fractional module boundary is what makes a small QR fail to
    decode."""
    total = modules + quiet * 2
    scale = min(box_w // total, box_h // total)
    if scale < 1:
        scale = 1
    side = total * scale
    x = box_x + (box_w - side) // 2
    y = box_y + (box_h - side) // 2
    return scale, x + quiet * scale, y + quiet * scale, side


class Palette:
    """Colors resolved once at construction. `color` is a BadgeOS global and
    is not importable at module scope under test."""

    def __init__(self, color):
        # #121212. Near-black rather than true black: an OLED-style pure
        # black makes the white QR card look like it is floating, and the
        # slight lift reads as a surface the card sits on.
        self.bg = color.rgb(18, 18, 18)
        self.fg = color.rgb(240, 240, 240)
        self.dim = color.rgb(150, 150, 150)
        self.accent = color.rgb(62, 207, 142)
        self.warn = color.rgb(240, 180, 60)
        self.bad = color.rgb(232, 92, 92)
        # The QR card stays pure white on pure black. Contrast is what a
        # phone camera needs, and this is the one element where looking
        # consistent matters less than scanning on the first try.
        self.card = color.rgb(255, 255, 255)
        self.ink = color.rgb(0, 0, 0)
        # The contribution grid, quietest to busiest. GitHub's own ramp, which
        # is the point: someone glancing at a badge should recognise it before
        # they have read a word of it. Index 0 is an empty day and sits just
        # above the background rather than on it, so the shape of the grid is
        # visible even in a quiet year.
        self.grid = (
            color.rgb(38, 38, 38),
            color.rgb(14, 68, 41),
            color.rgb(0, 109, 50),
            color.rgb(38, 166, 65),
            color.rgb(57, 211, 83),
        )
        # The artwork inks, ordered by luminance so an index is a brightness
        # ladder: a badge cell has one channel where a screen has a whole
        # character grid to play with.
        #
        # Index 0 is the ground, so a level of 0 can be drawn as "clear" or
        # skipped, and the ramp and its background never disagree. Separate
        # from `grid` above on purpose: that one is GitHub's contribution ramp
        # and two other apps read it.
        self.artwork_bg = color.rgb(9, 14, 13)
        self.artwork = (
            self.artwork_bg,
            color.rgb(0, 189, 88),
            color.rgb(62, 207, 142),
            color.rgb(149, 230, 184),
            color.rgb(225, 252, 215),
            color.rgb(255, 255, 255),
        )
        # The console chrome: a raised surface, the hairline that bounds it,
        # and the scanline that sits between. Three steps between the ground
        # and the surface rather than a gradient, because nothing in this
        # design system lands between two states.
        self.panel = color.rgb(20, 26, 24)
        self.line = color.rgb(34, 46, 42)
        self.scanline = color.rgb(15, 20, 19)


class PairingScreen:
    def __init__(self, screen, shape, color, palette=None):
        self.screen = screen
        self.shape = shape
        # Kept because the mark resolves its own pens each frame; `color` is
        # a BadgeOS global that cannot be imported at module scope.
        self._color = color
        self.palette = palette or Palette(color)
        self._matrix = None
        self._matrix_for = None

    def draw(self, machine, now_ms=0):
        screen = self.screen
        pal = self.palette
        screen.pen = pal.bg
        screen.clear()

        state = machine.state
        if state == STATE_WAITING:
            self._draw_welcome()
            self._draw_pairing(machine, now_ms)
        elif state in (STATE_APPROVED, STATE_DONE):
            self._draw_centered("Paired", pal.accent, machine.detail or "")
        elif state == STATE_EXPIRED:
            self._draw_centered("Code expired", pal.warn, machine.detail or "")
        elif state == STATE_DENIED:
            self._draw_centered("Declined", pal.bad, machine.detail or "")
        elif state == STATE_NO_CREDENTIALS:
            self._draw_centered("No WiFi set up", pal.bad, machine.detail or "")
        elif state == STATE_NO_NETWORK:
            self._draw_centered(machine.message, pal.warn, machine.detail or "")
        elif state == STATE_ERROR:
            self._draw_centered(machine.message, pal.bad, machine.detail or "")
        elif state in (STATE_CONNECTING, STATE_STARTING):
            self._draw_centered(machine.message, pal.dim, machine.detail or "")
        else:
            self._draw_centered(machine.message, pal.dim, machine.detail or "")

    # -- pieces ------------------------------------------------------------

    def _use_font(self, name):
        font = rom_font_named(name)
        if font is not None:
            self.screen.font = font

    def _draw_welcome(self):
        """Mark and welcome centered on one line, instruction centered below.

        Both are fitted rather than set at a fixed size: they are full phrases
        on a 320 pixel screen, and a size that fits the emulator font can
        overflow the badge's vector font.
        """
        screen = self.screen
        pal = self.palette

        self._use_font(FONT_WELCOME)
        mark_w = brand.mark_size(LOGO_H)
        size = fit_size(
            screen.measure_text,
            WELCOME,
            WIDTH - MARGIN * 2 - mark_w - LOGO_GAP,
            LOGO_H,
            max_size=PROMPT_MAX_SIZE,
            min_size=PROMPT_MIN_SIZE,
        )
        text_w, _ = screen.measure_text(WELCOME, size)
        # Mark and words are centered as one group, so the pair reads as a
        # lockup rather than a logo with a caption drifting beside it.
        group_x = max(MARGIN, (WIDTH - (mark_w + LOGO_GAP + text_w)) // 2)
        brand.draw_mark(screen, self.shape, self._color, group_x, MARGIN, LOGO_H)
        screen.pen = pal.fg
        screen.text(WELCOME, group_x + mark_w + LOGO_GAP, MARGIN + LOGO_H - 4, size)

        self._use_font(FONT_PROMPT)
        psize = fit_size(
            screen.measure_text,
            PROMPT,
            WIDTH - MARGIN * 2,
            PROMPT_H,
            max_size=PROMPT_MAX_SIZE,
            min_size=PROMPT_MIN_SIZE,
        )
        pwidth, _ = screen.measure_text(PROMPT, psize)
        screen.pen = pal.dim
        screen.text(
            PROMPT,
            max(MARGIN, (WIDTH - pwidth) // 2),
            MARGIN + LOGO_H + 4 + PROMPT_H - 2,
            psize,
        )

    def _draw_pairing(self, machine, now_ms):
        screen = self.screen
        pal = self.palette

        # The code keeps its dash here. It is the fallback for a camera that
        # will not focus, and someone reading it aloud or typing it needs the
        # grouping the dash gives.
        code = machine.user_code or ""
        if code:
            # The vector font when the badge has it, the ROM font otherwise.
            # fit_size then does real work rather than returning its own cap.
            code_font = vector_font_at(CODE_FONT_PATH)
            if code_font is not None:
                screen.font = code_font
            else:
                self._use_font(FONT_CODE)
            size = fit_size(screen.measure_text, code, CODE_COL_W, CODE_H)
            cwidth, cheight = screen.measure_text(code, size)
            # screen.text takes the TOP of the text. Drawing at the bottom of
            # the band put the code's last few pixels past the edge of the
            # screen, which is enough to make a B unreadable as anything but an
            # R on the one string someone has to read aloud. Centred in its own
            # band instead, so it cannot clip whatever size it lands on.
            code_top = HEIGHT - MARGIN - TIMER_H - CODE_H
            screen.pen = pal.fg
            screen.text(
                code,
                max(MARGIN, (WIDTH - cwidth) // 2),
                code_top + max(0, (CODE_H - cheight) // 2),
                size,
            )

        self._use_font(FONT_SMALL)
        remaining = machine.seconds_left(now_ms)
        if remaining is not None:
            rtext = format_remaining(remaining)
            rwidth, _ = screen.measure_text(rtext, BODY_SIZE)
            screen.pen = pal.dim
            screen.text(rtext, max(MARGIN, (WIDTH - rwidth) // 2), HEIGHT - MARGIN, BODY_SIZE)
        if machine.detail:
            dwidth, _ = screen.measure_text(machine.detail, BODY_SIZE)
            screen.pen = pal.warn
            screen.text(
                machine.detail,
                max(MARGIN, (WIDTH - dwidth) // 2),
                HEIGHT - MARGIN - TIMER_H - CODE_H,
                BODY_SIZE,
            )

        self._draw_qr(machine.verification_uri)

    def _draw_qr(self, uri):
        if not uri:
            return
        # Encoding is expensive enough to notice in a frame loop, and the
        # URI does not change while a code is on screen, so the matrix is
        # built once and reused until the code is replaced.
        if uri != self._matrix_for:
            try:
                self._matrix = qr.qr_matrix(uri, "medium")
            except (qr.DataTooLongError, ValueError):
                # Medium correction has less room; a long verification URI
                # still deserves a scannable code, so drop to low before
                # giving up on the QR entirely.
                try:
                    self._matrix = qr.qr_matrix(uri, "low")
                except (qr.DataTooLongError, ValueError):
                    self._matrix = None
            self._matrix_for = uri
        if not self._matrix:
            return

        # Centered in the band between the header and the code strip. Full
        # screen width as the box, so qr_layout centers it horizontally.
        box_y = HEADER_H
        box_h = HEIGHT - HEADER_H - CODE_H - TIMER_H - MARGIN
        scale, x, y, side = qr_layout(len(self._matrix), 0, box_y, QR_BOX, box_h)

        screen = self.screen
        # The light card is the quiet zone. Drawing it explicitly means the
        # dark page background never touches the finder patterns.
        screen.pen = self.palette.card
        screen.shape(
            self.shape.rectangle(x - QUIET * scale, y - QUIET * scale, side, side),
        )
        screen.pen = self.palette.ink
        qr.draw_qr(screen, self._matrix, x, y, scale, self.shape.rectangle)

    def _draw_centered(self, title, pen, detail=""):
        screen = self.screen
        size = fit_size(screen.measure_text, title, WIDTH - MARGIN * 2, 60, 18, 6)
        width, _ = screen.measure_text(title, size)
        screen.pen = pen
        screen.text(title, max(MARGIN, (WIDTH - width) // 2), HEIGHT // 2, size)
        if detail:
            dwidth, _ = screen.measure_text(detail, BODY_SIZE)
            screen.pen = self.palette.dim
            screen.text(
                detail, max(MARGIN, (WIDTH - dwidth) // 2), HEIGHT // 2 + 30, BODY_SIZE
            )


# -- pictures -----------------------------------------------------------------
#
# Every app that draws one does the same two things: turn a path into something
# the firmware can blit, and put it in a rectangle. Both can fail in ways that
# must cost the picture and nothing else, and both were written three times
# before this, once per app, which is how `import image` came to be wrong in
# three places at once.
#
# `image` is passed in rather than imported. BadgeOS injects it into an app's
# namespace the way it injects `screen`; there is no module to import on the
# badge, and pretending otherwise fails only on hardware.


def load_picture(image, path):
    """A drawable picture, or None and the reason why.

    Returns (source, error). The error is a short string meant to be drawn on
    a screen that has no console attached to it.
    """
    if not path:
        return None, ""
    if image is None:
        return None, "no image global"
    try:
        return image.load(path), ""
    except Exception as e:  # noqa: BLE001 - any failure is the same failure
        return None, "load: %s" % (str(e) or e.__class__.__name__)


def draw_picture(screen, source, x, y, w, h, rect=None):
    """Put a picture in a box. True when it landed.

    `blit` scales only when it is handed a `rect`, and `rect` is a BadgeOS
    constructor rather than a tuple: passing (x, y, w, h) raises, which is what
    "blit failed" on the card was. It is injected into an app's namespace like
    `image`, so it arrives here as an argument for the same reason.

    Without one, the picture is blitted at its own size to the top left of the
    box. That is not a fallback so much as the normal case now: the server
    stores every picture at the size it will be drawn, so one to one is already
    the right answer and scaling would only soften it.
    """
    if source is None:
        return False

    if rect is not None:
        try:
            screen.blit(source, rect(x, y, w, h))
            return True
        except Exception:  # noqa: BLE001 - an older firmware, or a bad rect
            pass

    try:
        screen.blit(source, x, y)
        return True
    except Exception:  # noqa: BLE001 - a firmware without blit at all
        return False


# The hold indicator: a bar that fills along the bottom of the screen while a
# button is held, and vanishes the moment it is let go.
HOLD_BAR_H = 5
HOLD_LABEL_SIZE = 12


def draw_hold(screen, shape, palette, progress, label=None, width=WIDTH, height=HEIGHT):
    """Show that a hold is being counted. True when something was drawn.

    Holding B for a second and a half re-pairs the badge and it drew nothing
    at all while doing it, so the gesture read as a badge ignoring the button.
    A wearer who cannot see a hold being counted assumes it is not working and
    lets go at exactly the wrong moment.

    Drawn by the runtime on top of whatever the app drew, because the gesture
    belongs to the runtime on every screen of every app.
    """
    if not progress or progress <= 0:
        return False
    if progress > 1:
        progress = 1

    filled = int(width * progress)
    y = height - HOLD_BAR_H
    screen.pen = palette.dim
    screen.shape(shape.rectangle(0, y, width, HOLD_BAR_H))
    if filled > 0:
        screen.pen = palette.accent
        screen.shape(shape.rectangle(0, y, filled, HOLD_BAR_H))

    if label:
        size = HOLD_LABEL_SIZE
        text_w, _ = screen.measure_text(label, size)
        screen.pen = palette.fg
        screen.text(
            label,
            max(MARGIN, (width - text_w) // 2),
            y - size - 2,
            size,
        )
    return True



# -- console chrome ----------------------------------------------------------
#
# The badge's screens are 320x240 of a design system built on a character
# grid: hard edges, few levels, nothing interpolated. These are the pieces
# every app draws over and over, in one place, so no two apps invent their own
# idea of what a panel looks like.
#
# All of it is drawn with `shape` rectangles, because that is the vector
# primitive the Badgeware docs give and the one the rest of the SDK uses.

# The status strip along the top: an app's name, its state, and its count.
STATUS_H = 16
STATUS_SIZE = 11
STATUS_PAD = 4
# Every eighth row. At three the texture ate the contrast the text needed and
# the panel read as noise rather than as a surface.
SCANLINE_STEP = 8
# Hairline thickness. One pixel disappears at a metre; two is the badge.
HAIRLINE = 2


def fill(screen, shape, x, y, w, h):
    """One filled rectangle. Every piece of chrome below is made of these."""
    screen.shape(shape.rectangle(int(x), int(y), int(w), int(h)))


def frame(screen, shape, x, y, w, h, t=HAIRLINE):
    """A hollow rectangle, drawn as four filled strips.

    There is no outline primitive: `screen.shape` fills whatever it is given.
    """
    fill(screen, shape, x, y, w, t)
    fill(screen, shape, x, y + h - t, w, t)
    fill(screen, shape, x, y, t, h)
    fill(screen, shape, x + w - t, y, t, h)


def panel(screen, shape, palette, x, y, w, h, border=None):
    """A raised surface with a hairline around it.

    The one shape that makes a badge screen look built rather than printed on.
    """
    screen.pen = palette.panel
    fill(screen, shape, x, y, w, h)
    screen.pen = border if border is not None else palette.line
    frame(screen, shape, x, y, w, h)


def scanlines(screen, shape, palette, x, y, w, h, step=SCANLINE_STEP):
    """Darken every nth row of a box.

    A flat fill on a 320x240 panel reads as printed paper. The visual
    language is a character grid being written to, and this is the cheapest
    honest echo of it: hard rows, no falloff, drawn once per frame.
    """
    screen.pen = palette.scanline
    row = y
    while row < y + h:
        fill(screen, shape, x, row, w, 1)
        row += step


def status_bar(screen, shape, palette, left="", middle="", right="", accent=None):
    """The strip across the top: where you are, what is happening, how far in.

    Three slots because that is what a badge has room for, and because every
    app answers the same three questions: what am I, what am I doing, and how
    much of it is left.
    """
    screen.pen = palette.panel
    fill(screen, shape, 0, 0, WIDTH, STATUS_H)
    screen.pen = palette.line
    fill(screen, shape, 0, STATUS_H - 1, WIDTH, 1)

    baseline = (STATUS_H - STATUS_SIZE) // 2
    if left:
        screen.pen = accent if accent is not None else palette.accent
        screen.text(left, STATUS_PAD, baseline, STATUS_SIZE)
    if middle:
        width, _ = screen.measure_text(middle, STATUS_SIZE)
        screen.pen = palette.dim
        screen.text(middle, (WIDTH - width) // 2, baseline, STATUS_SIZE)
    if right:
        width, _ = screen.measure_text(right, STATUS_SIZE)
        screen.pen = palette.dim
        screen.text(right, WIDTH - STATUS_PAD - width, baseline, STATUS_SIZE)
    return STATUS_H


def meter(screen, shape, palette, x, y, w, h, fraction, pen=None, track=None):
    """A bar that fills in whole steps.

    Quantised on purpose. A tally sliding smoothly from 61 to 62 per cent is a
    shader; this design system counts.
    """
    screen.pen = track if track is not None else palette.line
    fill(screen, shape, x, y, w, h)
    if fraction <= 0:
        return 0
    if fraction > 1:
        fraction = 1
    # Whole cells, so two options a percent apart draw a visible step rather
    # than a subpixel one nobody can see.
    cells = max(1, int(w // 4))
    lit = int(fraction * cells)
    if lit <= 0:
        lit = 1
    width = int(lit * (w / float(cells)))
    screen.pen = pen if pen is not None else palette.accent
    fill(screen, shape, x, y, width, h)
    return width


# -- drawn type --------------------------------------------------------------
#
# Headlines are drawn from a glyph table rather than set in a ROM font. The ROM
# fonts top out at 20 pixels and are proportional, which makes a heading look
# like body text that happened to be bigger. A 5x7 cell scaled up is the
# typography of the thing this design system is imitating: a character grid
# being written to, one whole cell at a time.
#
# Uppercase, digits and the punctuation a badge screen actually uses. Anything
# else falls back to a blank cell, so a stray character costs a space rather
# than a traceback.

BLOCK_W = 5
BLOCK_H = 7

_BLOCK_GLYPHS = {
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "B": ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
    "C": ("01110", "10001", "10000", "10000", "10000", "10001", "01110"),
    "D": ("11110", "10001", "10001", "10001", "10001", "10001", "11110"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "F": ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
    "G": ("01110", "10001", "10000", "10111", "10001", "10001", "01111"),
    "H": ("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
    "I": ("11111", "00100", "00100", "00100", "00100", "00100", "11111"),
    "J": ("00111", "00010", "00010", "00010", "00010", "10010", "01100"),
    "K": ("10001", "10010", "10100", "11000", "10100", "10010", "10001"),
    "L": ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
    "M": ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
    "N": ("10001", "11001", "10101", "10011", "10001", "10001", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    "Q": ("01110", "10001", "10001", "10001", "10101", "10010", "01101"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "U": ("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
    "V": ("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
    "W": ("10001", "10001", "10001", "10101", "10101", "11011", "10001"),
    "X": ("10001", "10001", "01010", "00100", "01010", "10001", "10001"),
    "Y": ("10001", "10001", "01010", "00100", "00100", "00100", "00100"),
    "Z": ("11111", "00001", "00010", "00100", "01000", "10000", "11111"),
    "0": ("01110", "10001", "10011", "10101", "11001", "10001", "01110"),
    "1": ("00100", "01100", "00100", "00100", "00100", "00100", "01110"),
    "2": ("01110", "10001", "00001", "00110", "01000", "10000", "11111"),
    "3": ("11110", "00001", "00001", "01110", "00001", "00001", "11110"),
    "4": ("00010", "00110", "01010", "10010", "11111", "00010", "00010"),
    "5": ("11111", "10000", "11110", "00001", "00001", "10001", "01110"),
    "6": ("00110", "01000", "10000", "11110", "10001", "10001", "01110"),
    "7": ("11111", "00001", "00010", "00100", "01000", "01000", "01000"),
    "8": ("01110", "10001", "10001", "01110", "10001", "10001", "01110"),
    "9": ("01110", "10001", "10001", "01111", "00001", "00010", "01100"),
    "-": ("00000", "00000", "00000", "11111", "00000", "00000", "00000"),
    ".": ("00000", "00000", "00000", "00000", "00000", "01100", "01100"),
    "'": ("00100", "00100", "00000", "00000", "00000", "00000", "00000"),
    "!": ("00100", "00100", "00100", "00100", "00100", "00000", "00100"),
    "?": ("01110", "10001", "00001", "00110", "00100", "00000", "00100"),
    "%": ("11001", "11010", "00010", "00100", "01000", "01011", "10011"),
    "/": ("00001", "00010", "00010", "00100", "01000", "01000", "10000"),
    ":": ("00000", "01100", "01100", "00000", "01100", "01100", "00000"),
    " ": ("00000", "00000", "00000", "00000", "00000", "00000", "00000"),
}

# One blank cell between letters, so a word reads as a word at cell 2 and up.
BLOCK_TRACKING = 1


def block_width(text, cell):
    """How wide `text` will be drawn at this cell size."""
    if not text:
        return 0
    per = (BLOCK_W + BLOCK_TRACKING) * cell
    return len(text) * per - BLOCK_TRACKING * cell


def block_text(screen, shape, text, x, y, cell):
    """Draw a heading from the glyph table. Returns the x it ended at.

    The pen is the caller's: a heading is often two colours, and setting one
    here would take that away.
    """
    step = (BLOCK_W + BLOCK_TRACKING) * cell
    for index, char in enumerate(text.upper()):
        glyph = _BLOCK_GLYPHS.get(char)
        if glyph is None:
            continue
        left = x + index * step
        for row, bits in enumerate(glyph):
            run = 0
            for col in range(BLOCK_W + 1):
                lit = col < BLOCK_W and bits[col] == "1"
                if lit:
                    run += 1
                    continue
                if run:
                    # Whole runs rather than a rectangle per cell. A heading is
                    # 25 glyphs of 35 cells and the frame loop must not block.
                    fill(
                        screen, shape,
                        left + (col - run) * cell, y + row * cell, run * cell, cell,
                    )
                    run = 0
    return x + len(text) * step - BLOCK_TRACKING * cell


def block_centred(screen, shape, text, y, cell, width=WIDTH):
    """A heading centred across the panel."""
    x = max(0, (width - block_width(text, cell)) // 2)
    block_text(screen, shape, text, x, y, cell)
    return BLOCK_H * cell


# -- small furniture ---------------------------------------------------------


def rule(screen, shape, x, y, w, t=1):
    """A hairline. What separates regions when a box would be too much."""
    fill(screen, shape, x, y, w, t)


def marker(screen, shape, x, y, h, w=3):
    """The stub down the left of a row that is yours or selected.

    A bar beside the row rather than a box around it: it marks one row without
    turning every other row into a container.
    """
    fill(screen, shape, x, y, w, h)


def chevron(screen, shape, x, y, up, size=4):
    """A scroll arrow, drawn as stacked runs. There is more above or below."""
    for step in range(size):
        run = (size - step) * 2 - 1
        row = y + (step if up else size - 1 - step)
        fill(screen, shape, x - run // 2, row, run, 1)


def blink(ticks, period=500):
    """Whether a blinking thing is lit this frame.

    Integer ticks, not a fade: nothing in this design system lands between two
    states.
    """
    return (ticks // period) % 2 == 0
