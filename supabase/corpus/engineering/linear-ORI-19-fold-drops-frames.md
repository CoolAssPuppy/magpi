# ORI-19 · Fold state change drops 9 frames

| | |
| --- | --- |
| Status | In Progress |
| Assignee | Ben Achilov |
| Labels | ori, shell, performance, bug |
| Project | Pane manager |
| Initiative | Ori shell for four panes |
| Created | 2026-08-19 |
| Updated | 2026-09-08 |

## Description

Going from phone to tablet, the compositor drops 9 frames at the transition. It reads as a stutter right at the moment a person is looking at the animation.

Trace shows the pane manager tearing down all four panes and rebuilding them because the panel count changed. Everything gets a new buffer even though two of the panes are unchanged.

## Activity

**Ben Achilov** changed status from Todo to In Progress · 2026-08-20

**Ben Achilov** commented · 2026-08-24
> Rewrote the layout diff so panes that map to the same panels keep their buffers. Down to 3 dropped frames. The remaining three are the new pane allocating, which I can do ahead of the fold because the hinge sensor sees the fold starting 180ms before the layout has to change.

**Ben Achilov** commented · 2026-08-28
> Speculative allocation on hinge movement: zero dropped frames when the fold completes, and one wasted allocation when someone half opens the phone and closes it again. The waste is 12MB for about 400ms.

**Sam Lindqvist** commented · 2026-08-29
> People fidget with folding phones. Open and shut, open and shut, in a meeting. Make sure that case does not leak.

**Ben Achilov** commented · 2026-09-08
> It leaked. See ORI-23. Fixed there, keeping this open until I can run the fidget test for an hour without memory growth.
