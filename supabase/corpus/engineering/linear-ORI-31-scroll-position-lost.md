# ORI-31 · Scroll position lost when an app moves from one pane to three

| | |
| --- | --- |
| Status | In Progress |
| Assignee | Ben Achilov |
| Labels | ori, continuity, bug |
| Project | App continuity |
| Initiative | Ori shell for four panes |
| Created | 2026-08-22 |
| Updated | 2026-09-07 |

## Description

Reading an article on one panel, open the phone, the article reflows to three panels and jumps back to the top. This is the single most annoying thing in the current build and every person who picks up a prototype hits it in the first minute.

The reflow is correct. The scroll anchor is what is wrong, we hand the app a new size and it recomputes from zero.

## Activity

**Ben Achilov** changed status from Todo to In Progress · 2026-08-24

**Ben Achilov** commented · 2026-08-25
> The platform text view can anchor on a character offset across a resize. Most apps use the platform text view. Apps that do their own layout will still jump and there is nothing Ori can do for them except give them the callback.

**Jane Okonkwo** commented · 2026-08-26
> How many of the fifteen apps in the demo build use the platform view.

**Ben Achilov** commented · 2026-08-26
> Eleven. Of the other four, two are ours and I can fix them, one is a browser and browsers have their own anchoring, one is a game and games do not scroll.

**Ben Achilov** commented · 2026-09-07
> Character offset anchoring in for the platform view. Article stays put through phone to tablet to desk and back. Our two apps fixed. The browser keeps its position horizontally and loses it vertically on the desk layout, which I have not worked out yet.
