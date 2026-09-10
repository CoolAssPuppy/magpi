// Reads the text out of one already-decoded PDF content stream.

/** PDF text is almost always WinAnsiEncoding, which 'latin1' names in the encoding standard. */
const winAnsi = new TextDecoder('latin1');

/** A TJ adjustment below this, in thousandths of a text space unit, is a word break. */
const WORD_GAP_THRESHOLD = -100;

type Operand = { kind: 'text'; value: string } | { kind: 'number'; value: number };

interface TextOutput {
  lines: string[];
  current: string;
}

/** The text one decoded content stream shows, one line per positioning break. */
export function readShownText(content: string): string {
  const out: TextOutput = { lines: [], current: '' };
  let operands: Operand[] = [];
  let i = 0;

  while (i < content.length) {
    const char = content[i];
    if (char === '(') {
      const literal = readLiteral(content, i);
      operands.push({ kind: 'text', value: literal.value });
      i = literal.next;
    } else if (char === '<' && content[i + 1] === '<') {
      i = skipDictionary(content, i);
    } else if (char === '<') {
      const hex = readHexString(content, i);
      operands.push({ kind: 'text', value: hex.value });
      i = hex.next;
    } else if (char === '/') {
      i = skipRegularRun(content, i + 1);
    } else if (char === '%') {
      // A comment can hold an unbalanced '(' that would otherwise open a string.
      i = skipComment(content, i);
    } else if (isRegular(char)) {
      const end = skipRegularRun(content, i);
      const token = content.slice(i, end);
      i = end;
      const value = Number(token);
      if (Number.isFinite(value) && /^[+\-.\d]/.test(token)) {
        operands.push({ kind: 'number', value });
      } else if (token === 'BI') {
        i = skipInlineImage(content, i);
        operands = [];
      } else {
        applyOperator(token, operands, out);
        operands = [];
      }
    } else {
      i++;
    }
  }

  out.lines.push(out.current);
  return out.lines.join('\n');
}

function applyOperator(operator: string, operands: readonly Operand[], out: TextOutput): void {
  switch (operator) {
    case 'Tj':
      showLastString(operands, out);
      return;
    case "'":
    case '"':
      breakLine(out);
      showLastString(operands, out);
      return;
    case 'TJ':
      showArray(operands, out);
      return;
    case 'Td':
    case 'TD':
    case 'T*':
    case 'ET':
      breakLine(out);
      return;
  }
}

function showLastString(operands: readonly Operand[], out: TextOutput): void {
  for (let i = operands.length - 1; i >= 0; i--) {
    const operand = operands[i];
    if (operand.kind === 'text') {
      out.current += operand.value;
      return;
    }
  }
}

function showArray(operands: readonly Operand[], out: TextOutput): void {
  for (const operand of operands) {
    if (operand.kind === 'text') out.current += operand.value;
    else if (operand.value < WORD_GAP_THRESHOLD) out.current += ' ';
  }
}

function breakLine(out: TextOutput): void {
  out.lines.push(out.current);
  out.current = '';
}

const ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  '(': '(',
  ')': ')',
  '\\': '\\',
};

/** Parentheses nest inside a literal string, so the first ')' is not the end. */
function readLiteral(content: string, at: number): { value: string; next: number } {
  let value = '';
  let depth = 1;
  let i = at + 1;

  while (i < content.length && depth > 0) {
    const char = content[i];
    if (char === '\\') {
      const escape = readEscape(content, i);
      value += escape.value;
      i = escape.next;
    } else if (char === '(') {
      depth++;
      value += char;
      i++;
    } else if (char === ')') {
      depth--;
      if (depth > 0) value += char;
      i++;
    } else {
      value += char;
      i++;
    }
  }
  return { value, next: i };
}

function readEscape(content: string, at: number): { value: string; next: number } {
  const char = content[at + 1];
  if (char === undefined) return { value: '', next: at + 1 };
  // A backslash before a newline continues the string across source lines.
  if (char === '\n') return { value: '', next: at + 2 };
  if (char === '\r') return { value: '', next: content[at + 2] === '\n' ? at + 3 : at + 2 };

  if (char >= '0' && char <= '7') {
    let digits = '';
    let i = at + 1;
    while (digits.length < 3 && content[i] >= '0' && content[i] <= '7') {
      digits += content[i];
      i++;
    }
    return { value: String.fromCharCode(parseInt(digits, 8)), next: i };
  }
  return { value: ESCAPES[char] ?? char, next: at + 2 };
}

function readHexString(content: string, at: number): { value: string; next: number } {
  const close = content.indexOf('>', at + 1);
  const end = close < 0 ? content.length : close;
  const digits = content.slice(at + 1, end).replace(/[^0-9a-fA-F]/g, '');
  // An odd digit count means the last byte was written with its zero implied.
  const padded = digits.length % 2 === 1 ? `${digits}0` : digits;

  const bytes = new Uint8Array(padded.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  }
  return { value: winAnsi.decode(bytes), next: end + 1 };
}

function isRegular(char: string): boolean {
  return !'()<>[]{}/%'.includes(char) && !/\s/.test(char);
}

function skipRegularRun(content: string, at: number): number {
  let i = at;
  while (i < content.length && isRegular(content[i])) i++;
  return i;
}

function skipComment(content: string, at: number): number {
  let i = at;
  while (i < content.length && content[i] !== '\n' && content[i] !== '\r') i++;
  return i;
}

function skipDictionary(content: string, at: number): number {
  let depth = 0;
  let i = at;
  while (i < content.length) {
    if (content.startsWith('<<', i)) {
      depth++;
      i += 2;
    } else if (content.startsWith('>>', i)) {
      depth--;
      i += 2;
      if (depth === 0) return i;
    } else {
      i++;
    }
  }
  return i;
}

/** Skips inline image bytes, which would otherwise be parsed as operators. */
function skipInlineImage(content: string, at: number): number {
  const finder = /\sEI(?=[\s\]/<(]|$)/g;
  finder.lastIndex = at;
  const match = finder.exec(content);
  return match === null ? content.length : match.index + match[0].length;
}
