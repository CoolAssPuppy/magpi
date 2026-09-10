# ORI-50 · Screen reader reading order across four panes

| | |
| --- | --- |
| Status | In Progress |
| Assignee | Ben Achilov |
| Labels | ori, accessibility, a11y |
| Project | Accessibility for four panes |
| Initiative | Ori shell for four panes |
| Created | 2026-08-23 |
| Updated | 2026-09-05 |

## Description

With four panes open the screen reader reads pane 1 top to bottom, then pane 2, and so on. That matches the physical order and it is wrong for the common case, where pane 1 holds a navigation list and panes 2 to 4 hold the thing you selected.

Needs a per-pane role so the shell knows which pane is the primary content, and a gesture to move focus between panes without walking through everything in the current one.

## Activity

**Ben Achilov** changed status from Todo to In Progress · 2026-08-25

**Ben Achilov** commented · 2026-08-27
> Three finger swipe left and right moves the reader between panes. Reading order defaults to focused pane first, then the others in physical order. Apps can declare a pane primary through `PaneRole`.

**Jane Okonkwo** commented · 2026-09-02
> Has anyone who uses a screen reader every day tried this.

**Ben Achilov** commented · 2026-09-02
> No. We have nobody on the team who does and I have been reviewing my own work, which is worth very little here.

**Jane Okonkwo** commented · 2026-09-03
> Then find two people and pay them for an afternoon before we call this done. Talk to Maya about how we arrange that without the unit leaving the building.

**Ben Achilov** commented · 2026-09-05
> Two sessions being arranged for the week of 21 September, in our office, on units that stay here. Holding this open until then.
