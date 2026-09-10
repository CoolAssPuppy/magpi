# ORI-45 · SDK naming: panes, displays or screens

| | |
| --- | --- |
| Status | Done |
| Assignee | Ben Achilov |
| Labels | ori, sdk, api, decision |
| Project | Multi-pane SDK preview |
| Initiative | Ori shell for four panes |
| Created | 2026-08-27 |
| Updated | 2026-09-01 |

## Description

The platform API a developer already knows calls these things displays. We call them panes internally, per ORI-14. The SDK preview goes out to developers who have written for one screen their whole career.

Option A: use `Pane` and teach the word.
Option B: use `Display` and match what they know.
Option C: use `Display` in the API and `pane` in the docs, which is the worst of both and is what the current draft does by accident.

## Activity

**Ben Achilov** commented · 2026-08-28
> Leaning A. Display already means something on this platform, a physical output device, and if we reuse it then `getDisplays()` returns one thing on a phone and four on ours and every existing app breaks its assumptions quietly.

**Jane Okonkwo** commented · 2026-08-29
> A. If the concept is new, give it a new word. Quiet breakage in other people's apps is how you get a reputation.

**Ben Achilov** commented · 2026-09-01
> Going with A. `Pane`, `PaneSet`, `onPaneChange`. `Display` keeps its platform meaning and returns the four physical panels for anyone who asks. Renamed through the preview SDK and the docs.

**Ben Achilov** changed status from In Progress to Done · 2026-09-01
