/**
 * Providers converging on one badge, with data moving along the wires.
 *
 * Each wire carries a short dash travelling left to right. A dash rather than
 * a glow, because this is a poll fetching a payload: a discrete thing arriving
 * somewhere, not a signal humming.
 *
 * The lanes are staggered so the five never beat together and turn into a
 * metronome, and the timing is linear because a packet does not accelerate.
 * `prefers-reduced-motion` stops all of it and the wires stay drawn, so the
 * diagram still says what connects to what.
 */
export function DataFlow({ lanes = 5 }: { lanes?: number }) {
  const width = 400;
  const height = 240;
  const junctionX = 268;
  const junctionY = height / 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-full w-full"
      aria-hidden="true"
      role="presentation"
    >
      {Array.from({ length: lanes }, (_, index) => {
        // Each lane leaves at the vertical centre of its provider row, so the
        // wire looks attached to the thing it carries rather than fanning from
        // a decorative point.
        const startY = (height * (index + 0.5)) / lanes;
        const path = `M0 ${startY} L${junctionX} ${junctionY}`;
        return (
          <g key={index}>
            <path
              d={path}
              pathLength={100}
              stroke="var(--color-border-strong)"
              strokeWidth="1"
              fill="none"
            />
            <path
              d={path}
              pathLength={100}
              stroke="var(--color-accent)"
              // Thicker than the wire it rides: preserveAspectRatio is off, so
              // a near-horizontal stroke is squashed by the vertical scale and
              // a 2px packet reads as a hairline.
              strokeWidth="4"
              fill="none"
              className="wire-packet"
              // Spread across one full trip, so a packet leaves one lane as
              // the last one arrives.
              style={{ animationDelay: `calc(var(--duration-wire) / ${lanes} * ${index})` }}
            />
          </g>
        );
      })}

      <path
        d={`M${junctionX} ${junctionY} L${width} ${junctionY}`}
        pathLength={100}
        stroke="var(--color-border-strong)"
        strokeWidth="2"
        fill="none"
      />
      <path
        d={`M${junctionX} ${junctionY} L${width} ${junctionY}`}
        pathLength={100}
        stroke="var(--color-accent)"
        strokeWidth="2"
        fill="none"
        className="wire-packet wire-packet-trunk"
      />
      <circle cx={junctionX} cy={junctionY} r="3" fill="var(--color-accent)" />
    </svg>
  );
}
