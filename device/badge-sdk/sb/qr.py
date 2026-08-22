# qr.py: QR Code matrix generator for the badge. Pure Python, MicroPython
# compatible (no typing, no deque, no dependencies).
#
# Provenance: this is a trimmed port of Project Nayuki's QR Code generator
# (python/qrcodegen.py), https://github.com/nayuki/QR-Code-generator,
# Copyright (c) Project Nayuki, MIT License. The port keeps byte-mode
# encoding with automatic version fit, all four error correction levels,
# Reed-Solomon ECC, and penalty-based mask selection, so output matches the
# reference encoder bit for bit. Removed: typing annotations, numeric and
# alphanumeric segment modes, ECI, and the ECL-boost option.
#
# Permission is hereby granted, free of charge, to any person obtaining a
# copy of this software and associated documentation files (the "Software"),
# to deal in the Software without restriction, including without limitation
# the rights to use, copy, modify, merge, publish, distribute, sublicense,
# and/or sell copies of the Software, and to permit persons to whom the
# Software is furnished to do so, subject to the following conditions: the
# above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software. The Software is provided
# "as is", without warranty of any kind.

MIN_VERSION = 1
MAX_VERSION = 40

# Error correction level name -> (table ordinal, format bits).
_ECL = {"low": (0, 1), "medium": (1, 0), "quartile": (2, 3), "high": (3, 2)}

# Tables from ISO 18004; index 0 is padding so the version indexes directly.
_ECC_CODEWORDS_PER_BLOCK = (
    # 0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40
    (-1,  7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30),  # Low
    (-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28),  # Medium
    (-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30),  # Quartile
    (-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30),  # High
)
_NUM_ERROR_CORRECTION_BLOCKS = (
    # 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40
    (-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25),  # Low
    (-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49),  # Medium
    (-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68),  # Quartile
    (-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81),  # High
)

_PENALTY_N1 = 3
_PENALTY_N2 = 3
_PENALTY_N3 = 40
_PENALTY_N4 = 10


class DataTooLongError(Exception):
    pass


def qr_matrix(text, ecl="low"):
    """Encodes text (UTF-8, byte mode) and returns the QR module matrix as
    a list of rows of booleans; True is a dark module. Picks the smallest
    version that fits at the given error correction level."""
    if ecl not in _ECL:
        raise ValueError("unknown error correction level %s" % ecl)
    ordinal, formatbits = _ECL[ecl]
    data = text.encode("utf-8")

    version = None
    ccbits = 0
    for v in range(MIN_VERSION, MAX_VERSION + 1):
        ccbits = 8 if v <= 9 else 16
        if 4 + ccbits + len(data) * 8 <= _num_data_codewords(v, ordinal) * 8:
            version = v
            break
    if version is None:
        raise DataTooLongError("text too long for a QR code: %d bytes" % len(data))

    capacity = _num_data_codewords(version, ordinal) * 8
    bb = _BitBuffer()
    bb.append_bits(0x4, 4)  # Byte mode indicator
    bb.append_bits(len(data), ccbits)
    for b in data:
        bb.append_bits(b, 8)
    bb.append_bits(0, min(4, capacity - len(bb)))  # Terminator
    bb.append_bits(0, -len(bb) % 8)  # Align to a byte boundary
    pad = 0xEC
    while len(bb) < capacity:
        bb.append_bits(pad, 8)
        pad ^= 0xEC ^ 0x11  # Alternate 0xEC, 0x11

    qr = _QrBuilder(version, ordinal, formatbits, bb.bytes())
    return qr.modules


def draw_qr(screen, matrix, x, y, scale, rect):
    """Draws the matrix as filled rectangles, one per horizontal run of
    dark modules. rect builds a rectangle shape (shape.rectangle on the
    badge); the pen color is the caller's responsibility."""
    size = len(matrix)
    for ry in range(size):
        row = matrix[ry]
        rx = 0
        while rx < size:
            if row[rx]:
                start = rx
                while rx < size and row[rx]:
                    rx += 1
                screen.shape(rect(x + start * scale, y + ry * scale, (rx - start) * scale, scale))
            else:
                rx += 1


class _BitBuffer:
    def __init__(self):
        self.bits = []

    def __len__(self):
        return len(self.bits)

    def append_bits(self, val, n):
        if n <= 0:
            return
        for i in range(n - 1, -1, -1):
            self.bits.append((val >> i) & 1)

    def bytes(self):
        result = bytearray((len(self.bits) + 7) // 8)
        for i, bit in enumerate(self.bits):
            result[i >> 3] |= bit << (7 - (i & 7))
        return result


def _num_raw_data_modules(ver):
    result = (16 * ver + 128) * ver + 64
    if ver >= 2:
        numalign = ver // 7 + 2
        result -= (25 * numalign - 10) * numalign - 55
        if ver >= 7:
            result -= 36
    return result


def _num_data_codewords(ver, ordinal):
    return (
        _num_raw_data_modules(ver) // 8
        - _ECC_CODEWORDS_PER_BLOCK[ordinal][ver] * _NUM_ERROR_CORRECTION_BLOCKS[ordinal][ver]
    )


def _rs_multiply(x, y):
    # Russian peasant multiplication in GF(2^8/0x11D).
    z = 0
    for i in range(7, -1, -1):
        z = (z << 1) ^ ((z >> 7) * 0x11D)
        z ^= ((y >> i) & 1) * x
    return z


def _rs_compute_divisor(degree):
    result = bytearray([0] * (degree - 1) + [1])
    root = 1
    for _ in range(degree):
        for j in range(degree):
            result[j] = _rs_multiply(result[j], root)
            if j + 1 < degree:
                result[j] ^= result[j + 1]
        root = _rs_multiply(root, 0x02)
    return result


def _rs_compute_remainder(data, divisor):
    # Shifted in place rather than with pop(0) plus append(0). MicroPython's
    # bytearray has neither method, so the pop version raised AttributeError on
    # the device while passing every test on CPython, where bytearray has both.
    result = bytearray(len(divisor))
    last = len(result) - 1
    for b in data:
        factor = b ^ result[0]
        for i in range(last):
            result[i] = result[i + 1]
        result[last] = 0
        for i, coef in enumerate(divisor):
            result[i] ^= _rs_multiply(coef, factor)
    return result


class _QrBuilder:
    def __init__(self, version, ordinal, formatbits, datacodewords):
        self.version = version
        self.ordinal = ordinal
        self.formatbits = formatbits
        self.size = version * 4 + 17
        self.modules = [[False] * self.size for _ in range(self.size)]
        self.isfunction = [[False] * self.size for _ in range(self.size)]
        self._draw_function_patterns()
        allcodewords = self._add_ecc_and_interleave(datacodewords)
        self._draw_codewords(allcodewords)

        # Choose the mask with the lowest penalty score.
        best_mask = 0
        best_penalty = 1 << 32
        for mask in range(8):
            self._apply_mask(mask)
            self._draw_format_bits(mask)
            penalty = self._penalty_score()
            if penalty < best_penalty:
                best_mask = mask
                best_penalty = penalty
            self._apply_mask(mask)  # XOR again to undo
        self._apply_mask(best_mask)
        self._draw_format_bits(best_mask)
        self.isfunction = None

    # ---- Function patterns ----

    def _set_function_module(self, x, y, dark):
        self.modules[y][x] = dark
        self.isfunction[y][x] = True

    def _draw_function_patterns(self):
        for i in range(self.size):
            self._set_function_module(6, i, i % 2 == 0)
            self._set_function_module(i, 6, i % 2 == 0)
        self._draw_finder_pattern(3, 3)
        self._draw_finder_pattern(self.size - 4, 3)
        self._draw_finder_pattern(3, self.size - 4)

        positions = self._alignment_positions()
        numalign = len(positions)
        for i in range(numalign):
            for j in range(numalign):
                if (i, j) in ((0, 0), (0, numalign - 1), (numalign - 1, 0)):
                    continue  # The three finder corners
                self._draw_alignment_pattern(positions[i], positions[j])

        self._draw_format_bits(0)  # Placeholder; overwritten after masking
        self._draw_version()

    def _draw_format_bits(self, mask):
        data = self.formatbits << 3 | mask
        rem = data
        for _ in range(10):
            rem = (rem << 1) ^ ((rem >> 9) * 0x537)
        bits = (data << 10 | rem) ^ 0x5412

        for i in range(6):
            self._set_function_module(8, i, (bits >> i) & 1 != 0)
        self._set_function_module(8, 7, (bits >> 6) & 1 != 0)
        self._set_function_module(8, 8, (bits >> 7) & 1 != 0)
        self._set_function_module(7, 8, (bits >> 8) & 1 != 0)
        for i in range(9, 15):
            self._set_function_module(14 - i, 8, (bits >> i) & 1 != 0)

        for i in range(8):
            self._set_function_module(self.size - 1 - i, 8, (bits >> i) & 1 != 0)
        for i in range(8, 15):
            self._set_function_module(8, self.size - 15 + i, (bits >> i) & 1 != 0)
        self._set_function_module(8, self.size - 8, True)  # Always dark

    def _draw_version(self):
        if self.version < 7:
            return
        rem = self.version
        for _ in range(12):
            rem = (rem << 1) ^ ((rem >> 11) * 0x1F25)
        bits = self.version << 12 | rem
        for i in range(18):
            bit = (bits >> i) & 1 != 0
            a = self.size - 11 + i % 3
            b = i // 3
            self._set_function_module(a, b, bit)
            self._set_function_module(b, a, bit)

    def _draw_finder_pattern(self, x, y):
        for dy in range(-4, 5):
            for dx in range(-4, 5):
                xx, yy = x + dx, y + dy
                if 0 <= xx < self.size and 0 <= yy < self.size:
                    self._set_function_module(xx, yy, max(abs(dx), abs(dy)) not in (2, 4))

    def _draw_alignment_pattern(self, x, y):
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                self._set_function_module(x + dx, y + dy, max(abs(dx), abs(dy)) != 1)

    def _alignment_positions(self):
        if self.version == 1:
            return []
        numalign = self.version // 7 + 2
        step = (self.version * 8 + numalign * 3 + 5) // (numalign * 4 - 4) * 2
        result = [6]
        pos = self.size - 7
        for _ in range(numalign - 1):
            result.insert(1, pos)
            pos -= step
        return result

    # ---- Codewords and masking ----

    def _add_ecc_and_interleave(self, data):
        version = self.version
        ordinal = self.ordinal
        numblocks = _NUM_ERROR_CORRECTION_BLOCKS[ordinal][version]
        blockecclen = _ECC_CODEWORDS_PER_BLOCK[ordinal][version]
        rawcodewords = _num_raw_data_modules(version) // 8
        numshortblocks = numblocks - rawcodewords % numblocks
        shortblocklen = rawcodewords // numblocks

        blocks = []
        rsdiv = _rs_compute_divisor(blockecclen)
        k = 0
        for i in range(numblocks):
            datalen = shortblocklen - blockecclen + (0 if i < numshortblocks else 1)
            dat = bytearray(data[k : k + datalen])
            k += datalen
            ecc = _rs_compute_remainder(dat, rsdiv)
            if i < numshortblocks:
                dat.append(0)
            blocks.append(dat + ecc)

        result = bytearray()
        for i in range(len(blocks[0])):
            for j, blk in enumerate(blocks):
                if i != shortblocklen - blockecclen or j >= numshortblocks:
                    result.append(blk[i])
        return result

    def _draw_codewords(self, data):
        i = 0
        right = self.size - 1
        while right >= 1:
            if right == 6:
                right = 5
            for vert in range(self.size):
                for j in range(2):
                    x = right - j
                    upward = ((right + 1) & 2) == 0
                    y = self.size - 1 - vert if upward else vert
                    if not self.isfunction[y][x] and i < len(data) * 8:
                        self.modules[y][x] = (data[i >> 3] >> (7 - (i & 7))) & 1 != 0
                        i += 1
            right -= 2

    def _apply_mask(self, mask):
        for y in range(self.size):
            for x in range(self.size):
                if _mask_bit(mask, x, y) and not self.isfunction[y][x]:
                    self.modules[y][x] = not self.modules[y][x]

    # ---- Penalty scoring ----

    def _penalty_score(self):
        result = 0
        size = self.size
        modules = self.modules

        # Rows and columns: adjacent runs of one color, finder-like patterns.
        for y in range(size):
            result += self._penalty_line([modules[y][x] for x in range(size)])
        for x in range(size):
            result += self._penalty_line([modules[y][x] for y in range(size)])

        # 2x2 blocks of one color.
        for y in range(size - 1):
            for x in range(size - 1):
                c = modules[y][x]
                if c == modules[y][x + 1] == modules[y + 1][x] == modules[y + 1][x + 1]:
                    result += _PENALTY_N2

        # Balance of dark and light modules.
        dark = 0
        for row in modules:
            for cell in row:
                if cell:
                    dark += 1
        total = size * size
        k = (abs(dark * 20 - total * 10) + total - 1) // total - 1
        result += k * _PENALTY_N4
        return result

    def _penalty_line(self, line):
        result = 0
        runcolor = False
        runlen = 0
        history = [0] * 7
        for cell in line:
            if cell == runcolor:
                runlen += 1
                if runlen == 5:
                    result += _PENALTY_N1
                elif runlen > 5:
                    result += 1
            else:
                self._finder_add_history(runlen, history)
                if not runcolor:
                    result += self._finder_count_patterns(history) * _PENALTY_N3
                runcolor = cell
                runlen = 1
        result += self._finder_terminate_and_count(runcolor, runlen, history) * _PENALTY_N3
        return result

    def _finder_count_patterns(self, history):
        n = history[1]
        core = (
            n > 0
            and history[2] == n
            and history[4] == n
            and history[5] == n
            and history[3] == n * 3
        )
        count = 0
        if core and history[0] >= n * 4 and history[6] >= n:
            count += 1
        if core and history[6] >= n * 4 and history[0] >= n:
            count += 1
        return count

    def _finder_terminate_and_count(self, runcolor, runlen, history):
        if runcolor:
            self._finder_add_history(runlen, history)
            runlen = 0
        runlen += self.size  # Light border after the final run
        self._finder_add_history(runlen, history)
        return self._finder_count_patterns(history)

    def _finder_add_history(self, runlen, history):
        if history[0] == 0:
            runlen += self.size  # Light border before the initial run
        history.insert(0, runlen)
        history.pop()


def _mask_bit(mask, x, y):
    # Returns True when the mask flips the module at (x, y).
    if mask == 0:
        return (x + y) % 2 == 0
    if mask == 1:
        return y % 2 == 0
    if mask == 2:
        return x % 3 == 0
    if mask == 3:
        return (x + y) % 3 == 0
    if mask == 4:
        return (x // 3 + y // 2) % 2 == 0
    if mask == 5:
        return x * y % 2 + x * y % 3 == 0
    if mask == 6:
        return (x * y % 2 + x * y % 3) % 2 == 0
    if mask == 7:
        return ((x + y) % 2 + x * y % 3) % 2 == 0
    raise ValueError("mask out of range")
