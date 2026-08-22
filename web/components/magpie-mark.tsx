/**
 * The wordmark bird: three folded planes, one lit, one shadowed, one sheen.
 * The same three shapes the badge SDK draws in brand.py, at the same
 * proportions, so the mark on the site and the mark on the device agree.
 */
export function MagpieMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={(size * 20) / 26}
      viewBox="0 0 26 20"
      fill="none"
      aria-hidden="true"
      role="presentation"
    >
      <path d="M0 10 L11 3 L11 12 Z" fill="var(--color-ink)" />
      <path d="M11 3 L26 0 L11 12 Z" fill="var(--color-ink-muted)" />
      <path d="M11 12 L26 0 L22 17 Z" fill="var(--color-accent)" />
    </svg>
  );
}

/**
 * The hero bird, bigger and fully folded.
 *
 * Each plane is flat, meeting the next at a hard crease. The lit and shadowed
 * faces come from tokens rather than a gradient, so it reads as paper in both
 * themes: white paper on black, black paper on white, with the belly staying
 * chalk because that is what the real bird does.
 */
export function FoldedMagpie({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 660 460"
      fill="none"
      className={className}
      aria-hidden="true"
      role="presentation"
    >
      <g>
        <path d="M198 214 L286 402 L372 224 Z" fill="var(--color-paper-underwing)" />
        <path d="M286 402 L372 224 L344 262 Z" fill="var(--color-paper-underwing-dark)" />
      </g>
      <g>
        <path d="M356 232 L648 322 L604 372 Z" fill="var(--color-paper-tail)" />
        <path d="M356 232 L604 372 L372 292 Z" fill="var(--color-paper-tail-dark)" />
        <path d="M596 316 L648 322 L604 372 Z" fill="var(--color-accent)" />
      </g>
      <g>
        <path d="M46 190 L206 128 L392 236 L196 232 Z" fill="var(--color-paper-body)" />
        <path d="M46 190 L196 232 L214 268 Z" fill="var(--color-paper-body-shade)" />
        <path d="M196 232 L392 236 L268 292 Z" fill="var(--color-paper-body-mid)" />
      </g>
      <g>
        <path d="M206 128 L318 12 L400 210 Z" fill="var(--color-paper-wing)" />
        <path d="M318 12 L400 210 L352 116 Z" fill="var(--color-paper-body-shade)" />
        <path d="M382 162 L400 210 L352 116 Z" fill="var(--color-accent)" />
      </g>
      <g>
        <path d="M46 190 L142 148 L138 206 Z" fill="var(--color-paper-head)" />
        <path d="M46 190 L138 206 L106 214 Z" fill="var(--color-paper-head-shade)" />
        <path d="M14 196 L46 190 L44 202 Z" fill="var(--color-accent-quiet)" />
      </g>
      <g stroke="var(--color-paper-crease)" strokeWidth="1">
        <path d="M46 190 L196 232" />
        <path d="M196 232 L392 236" />
        <path d="M206 128 L400 210" />
        <path d="M318 12 L352 116" />
        <path d="M356 232 L604 372" />
      </g>
    </svg>
  );
}
