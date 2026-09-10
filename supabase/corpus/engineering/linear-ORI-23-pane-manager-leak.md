# ORI-23 · Pane manager leaks buffers on rapid fold

| | |
| --- | --- |
| Status | Done |
| Assignee | Ben Achilov |
| Labels | ori, shell, bug, memory |
| Project | Pane manager |
| Initiative | Ori shell for four panes |
| Created | 2026-08-29 |
| Updated | 2026-09-02 |

## Description

Open and close the phone 200 times quickly and the compositor grows by 340MB and does not give it back. Found while testing the speculative allocation from ORI-19.

## Activity

**Ben Achilov** commented · 2026-09-02
> Speculative buffers were parented to the pending layout, and when the fold was abandoned the pending layout was dropped without running its release path. Classic. Release now happens in the layout destructor rather than in the commit path.
>
> 2000 folds, memory flat within 4MB. Wrote a stress test into CI so this cannot come back quietly.

**Ben Achilov** changed status from In Progress to Done · 2026-09-02
