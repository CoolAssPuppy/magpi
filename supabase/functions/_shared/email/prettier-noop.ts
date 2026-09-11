// Stand-in for prettier, which @react-email/render reaches for to pretty-print its HTML.
//
// Formatting is cosmetic for an email nobody reads the source of, and the esm.sh build of
// prettier crashes under Deno: it calls createRequire with an https URL. The import map points
// prettier's two entry points here, so render returns the HTML unformatted.

export function format(source: string): Promise<string> {
  return Promise.resolve(source);
}

export default { format };
