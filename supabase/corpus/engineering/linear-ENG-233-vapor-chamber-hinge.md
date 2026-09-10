# ENG-233 · Does the vapor chamber cross hinge 2

| | |
| --- | --- |
| Status | Done |
| Assignee | Sam Lindqvist |
| Labels | thermal, hinge, mechanical, decision |
| Project | Thermal budget |
| Initiative | Ship the Fold S1 to carrier certification |
| Created | 2026-08-19 |
| Updated | 2026-09-01 |

## Description

The SoC sits behind pane 1. The largest thermal mass is behind panes 3 and 4. A vapor chamber that crosses hinge 2 moves about 1.4W of headroom into the cold half. A vapor chamber that crosses a hinge also has to survive 200,000 folds.

Options:

1. One chamber per half, thermally connected by a graphite sheet folded through the hinge.
2. A flexible vapor chamber through hinge 2. Two vendors claim this works. Neither has shipped it in a three hinge device.
3. Nothing crosses the hinge. Pane 1 half runs hotter and we take the throttle.

## Activity

**Sam Lindqvist** changed status from Todo to In Progress · 2026-08-20

**Sam Lindqvist** commented · 2026-08-22
> Option 2 is out. I put a flexible chamber sample on the cycle rig on Thursday and it lost fluid at 24k cycles. The wick delaminates at the fold. This is a 2028 technology and we are shipping in November.

**Ben Achilov** commented · 2026-08-22
> Option 3 costs me the four-pane video case in ENG-230 and probably the camera case too.

**Sam Lindqvist** commented · 2026-08-28
> Option 1 measured. Folded graphite through hinge 2, 60 micron, routed beside the display flex. Moves 0.9W, not the 1.4W the model promised, because the fold in the graphite is a thermal resistance the model ignored.
>
> 0.9W is enough for Ben's ten minute case with the backlight work. It does not save us on a 30 minute video call in a warm room.

**Ben Achilov** commented · 2026-08-31
> Thirty minute call in a warm room throttles to 41fps on a video call that renders at 30. Nobody sees it. I can live with option 1.

**Sam Lindqvist** commented · 2026-09-01
> Option 1 it is. Two chambers, folded graphite bridge through hinge 2. Mechanical drawing is updated, the graphite adds 0.11mm to the hinge stack which we had in budget.

**Sam Lindqvist** changed status from In Progress to Done · 2026-09-01
