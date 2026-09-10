/** Makes a message a full sentence. Idempotent, so a column of mixed shapes is safe. */
export function asSentence(message: string): string {
  const trimmed = message.trim();
  const opened = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return opened.endsWith('.') ? opened : `${opened}.`;
}
