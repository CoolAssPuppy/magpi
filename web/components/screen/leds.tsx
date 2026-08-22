import { LED_LEVELS } from "@/lib/badge-constants";

/**
 * The four case LEDs, shown beside a preview so a page that lights them says
 * so. There are no LEDs on the badge screen; this is an annotation.
 */
export function LedRow({ levels }: { levels: readonly number[] }) {
  const shown = Array.from({ length: LED_LEVELS }, (_, index) => levels[index] ?? 0);
  return (
    <div className="gap-sm flex items-center" aria-label="Case LEDs">
      <span className="font-display text-2xs text-ink-faint tracking-wide">LEDS</span>
      {shown.map((level, index) =>
        level > 0 ? (
          <span
            key={index}
            className="size-xl rounded-pill bg-led-on"
            style={{ opacity: level }}
            data-level={level}
          />
        ) : (
          <span key={index} className="size-xl rounded-pill bg-led-off" data-level={0} />
        ),
      )}
    </div>
  );
}
