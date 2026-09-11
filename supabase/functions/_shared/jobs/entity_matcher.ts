// Aho-Corasick: finds every known entity name in a body of text in one pass over the text.

/** A name to look for, with whatever the caller wants back when it is found. */
export interface Needle {
  id: string;
  text: string;
}

interface Node {
  next: Map<number, number>;
  fail: number;
  /** Needles ending at this node, including those reached through the fail links. */
  out: number[];
}

export interface EntityMatcher {
  /** The ids of every needle that appears in the text, as whole words. */
  find(text: string): Set<string>;
  readonly size: number;
}

/** Whitespace runs collapse so a name split across a line break still reads as the name. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ');
}

/** A name only counts as a mention when letters and digits do not run into it on either side. */
function isBoundary(code: number): boolean {
  // Off either end of the text, which charCodeAt reports as NaN.
  if (Number.isNaN(code)) return true;
  const char = String.fromCharCode(code);
  return !/[\p{L}\p{N}]/u.test(char);
}

const EMPTY: EntityMatcher = { find: () => new Set(), size: 0 };

/**
 * One automaton over every known name, so a chunk is scanned once however many names are known.
 * Names shorter than two characters are dropped: an initial matches half the corpus.
 */
export function buildMatcher(needles: Needle[]): EntityMatcher {
  const patterns = needles
    .map((needle) => ({ id: needle.id, text: normalize(needle.text).trim() }))
    .filter((needle) => needle.text.length >= 2);
  if (patterns.length === 0) return EMPTY;

  const nodes: Node[] = [{ next: new Map(), fail: 0, out: [] }];
  patterns.forEach((pattern, index) => {
    let current = 0;
    for (const code of [...pattern.text].map((char) => char.charCodeAt(0))) {
      const found = nodes[current].next.get(code);
      if (found === undefined) {
        nodes.push({ next: new Map(), fail: 0, out: [] });
        nodes[current].next.set(code, nodes.length - 1);
        current = nodes.length - 1;
      } else {
        current = found;
      }
    }
    nodes[current].out.push(index);
  });

  // Breadth first, so a node's fail target is finished before the node reads it.
  // A depth-one node falls back to the root; anything deeper follows its parent's fail link.
  const queue = [...nodes[0].next.values()];
  for (const child of queue) nodes[child].fail = 0;

  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    for (const [code, child] of nodes[current].next) {
      if (current !== 0) {
        let fail = nodes[current].fail;
        while (fail !== 0 && !nodes[fail].next.has(code)) fail = nodes[fail].fail;
        nodes[child].fail = nodes[fail].next.get(code) ?? 0;
      }
      // A name ending inside a longer one is still that name, so outputs are carried down.
      nodes[child].out = [...nodes[child].out, ...nodes[nodes[child].fail].out];
      queue.push(child);
    }
  }

  return {
    size: patterns.length,
    find(text) {
      const haystack = normalize(text);
      const found = new Set<string>();
      let current = 0;

      for (let index = 0; index < haystack.length; index += 1) {
        const code = haystack.charCodeAt(index);
        while (current !== 0 && !nodes[current].next.has(code)) current = nodes[current].fail;
        current = nodes[current].next.get(code) ?? 0;

        for (const matched of nodes[current].out) {
          const pattern = patterns[matched];
          const start = index - pattern.text.length + 1;
          if (!isBoundary(haystack.charCodeAt(start - 1))) continue;
          if (!isBoundary(haystack.charCodeAt(index + 1))) continue;
          found.add(pattern.id);
        }
      }
      return found;
    },
  };
}
