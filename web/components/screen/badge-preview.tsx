import { SCREEN_H, SCREEN_W } from "@/lib/badge-constants";
import { blockWidth, type DrawOp } from "@/lib/preview/types";

/**
 * The badge screen at true size, drawn from what the device actually drew.
 *
 * The operations come from web/tests/fixtures/preview-fixtures.json, which is
 * recorded by running the real Python pages. Nothing here reads a layout: this
 * replays one, which is what stops the preview and the device drifting.
 *
 * Fixed at 320 by 240 rather than scaled, because a preview at eighty percent
 * lies about whether a title fits. The palette is the badge's own in both
 * themes: the device has no light mode.
 */
export function BadgePreview({ ops, label }: { ops: DrawOp[]; label?: string }) {
  return (
    <div
      role="img"
      aria-label={label ?? "Badge screen"}
      className="bg-screen font-screen relative overflow-hidden"
      style={{ width: SCREEN_W, height: SCREEN_H }}
      data-testid="badge-preview"
    >
      {render(ops)}
    </div>
  );
}

/**
 * Replay the operations in order, carrying the pen the way the device does.
 *
 * A pen is set and then used by everything after it, so it is threaded through
 * rather than attached to each operation. That is the device's own model, and
 * copying it is what keeps a recolour from needing a second edit here.
 */
function render(ops: DrawOp[]) {
  const nodes: React.ReactNode[] = [];
  // The device boots its pen to the screen foreground.
  let pen = "var(--color-screen-ink)";

  for (const [index, op] of ops.entries()) {
    if (op.op === "pen") {
      pen = op.value;
      continue;
    }
    if (op.op === "rect") {
      nodes.push(
        <span
          key={index}
          className="absolute"
          style={{
            left: op.x,
            top: op.y,
            width: op.w,
            height: op.h,
            backgroundColor: pen,
          }}
        />,
      );
      continue;
    }
    if (op.op === "text") {
      nodes.push(
        <span
          key={index}
          className="absolute whitespace-pre"
          style={{
            left: op.x,
            top: op.y,
            fontSize: op.size,
            lineHeight: 1,
            color: pen,
          }}
        >
          {op.text}
        </span>,
      );
      continue;
    }
    if (op.op === "block") {
      // A headline is a 5 by 7 glyph grid scaled by `cell`, so the drawn
      // height is seven cells and the width comes from the same arithmetic
      // ui.block_width uses. Set rather than drawn per pixel: the web has a
      // font engine and the badge does not.
      nodes.push(
        <span
          key={index}
          className="absolute whitespace-pre font-bold"
          style={{
            left: op.x,
            top: op.y,
            width: blockWidth(op.text, op.cell),
            fontSize: op.cell * 7,
            lineHeight: 1,
            letterSpacing: op.cell * 1,
            color: pen,
          }}
        >
          {op.text}
        </span>,
      );
    }
  }
  return nodes;
}
