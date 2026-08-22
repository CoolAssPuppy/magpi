/**
 * The provider marks, as flat monochrome glyphs.
 *
 * These are the one place the product draws somebody else's shape rather than
 * its own. A folded-paper reinterpretation of the Google G would be neither
 * recognisable nor theirs to redraw, and recognising the service at a glance
 * is the whole job of this column.
 *
 * Single colour, so they sit in the palette rather than dragging five brand
 * palettes onto a page whose accent is a narrow band on a black wing.
 */
export function ProviderMark({ slug, size = 18 }: { slug: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": true as const,
  };

  switch (slug) {
    case "google":
      return (
        <svg {...common}>
          <path d="M12 11v3.2h5.3a4.6 4.6 0 0 1-5.3 3.4 5.6 5.6 0 0 1 0-11.2 5 5 0 0 1 3.4 1.3l2.4-2.4A8.7 8.7 0 0 0 12 3a9 9 0 1 0 0 18c5.2 0 8.7-3.6 8.7-8.8 0-.6 0-1-.1-1.2Z" />
        </svg>
      );
    case "linear":
      return (
        <svg {...common}>
          <path d="M2.6 14.6 9.4 21.4A9.7 9.7 0 0 1 2.6 14.6ZM2.1 11.2l10.7 10.7q1-.1 1.9-.4L2.5 9.3q-.3.9-.4 1.9ZM3.5 7.5l13 13q.8-.4 1.5-.9L4.4 6q-.5.7-.9 1.5ZM6.1 4.5 19.5 17.9a9.9 9.9 0 0 0 1.1-1.4L7.5 3.4A9.9 9.9 0 0 0 6.1 4.5ZM21.9 13.6 10.4 2.1a10 10 0 0 1 11.5 11.5Z" />
        </svg>
      );
    case "slack":
      return (
        <svg {...common}>
          <path d="M5.1 14.5a2 2 0 1 1-2-2h2Zm1 0a2 2 0 0 1 4 0v5a2 2 0 1 1-4 0ZM9.1 5.1a2 2 0 1 1 2-2v2Zm0 1a2 2 0 0 1 0 4h-5a2 2 0 1 1 0-4ZM18.9 9.1a2 2 0 1 1 2 2h-2Zm-1 0a2 2 0 0 1-4 0v-5a2 2 0 1 1 4 0ZM14.9 18.9a2 2 0 1 1-2 2v-2Zm0-1a2 2 0 0 1 0-4h5a2 2 0 1 1 0 4Z" />
        </svg>
      );
    case "github":
      return (
        <svg {...common}>
          <path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.4-3.4-1.4-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 3 .8 0-.7.4-1.1.7-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7 0-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2Z" />
        </svg>
      );
    case "notion":
      return (
        <svg {...common}>
          <path d="M4.2 3.3 15.6 2.5c1.4-.1 1.8 0 2.7.6l3.2 2.2c.6.4.8.5.8 1v13.1c0 .9-.3 1.4-1.4 1.5l-13.2.8c-.8.1-1.2 0-1.7-.6l-2.6-3.4c-.5-.7-.7-1.2-.7-1.8V4.7c0-.7.3-1.3 1.5-1.4Zm11 1.6-11 .8c-.2 0-.3.2-.1.4l1.6 1.2c.2.2.5.3.9.3l10.6-.6c.2 0 .1-.2 0-.3l-1.9-1.4a1 1 0 0 0-1-.4ZM6 9v11.1c0 .6.3.8 1 .8l11.6-.7c.7 0 .8-.5.8-1V8.2c0-.5-.2-.7-.6-.7l-12 .7c-.5 0-.8.3-.8.8Zm11.3.6c.1.4 0 .7-.3.8l-.6.1v8.2c-.5.3-1 .4-1.4.4-.6 0-.8-.2-1.2-.7l-3.7-5.8v5.6l1.2.3s0 .7-1 .7l-2.6.1c-.1-.2 0-.6.3-.7l.6-.2v-7.3l-.9-.1c0-.4.2-1 .8-1l2.8-.2 3.8 5.9V11l-1-.1c-.1-.5.2-.8.7-.8Z" />
        </svg>
      );
    case "vercel":
      return (
        <svg {...common}>
          <path d="M12 3 22.4 21H1.6Z" />
        </svg>
      );
    case "posthog":
      return (
        <svg {...common}>
          <path d="M2 12.8 11.2 22H2ZM2 7.4 16.6 22h-4.1L2 11.5ZM2 2l20 20h-4.1L2 6.1ZM7.4 2 22 16.6v4.1L7.4 2Zm5.4 0L22 11.2V2Z" />
        </svg>
      );
    default:
      // A provider added by migration before its mark exists still lists.
      return (
        <svg {...common}>
          <path d="M4 12 12 4l8 8-8 8Z" />
        </svg>
      );
  }
}
