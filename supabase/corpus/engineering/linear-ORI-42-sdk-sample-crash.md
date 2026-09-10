# ORI-42 · SDK sample app crashes on the fourth pane

| | |
| --- | --- |
| Status | Done |
| Assignee | Ben Achilov |
| Labels | ori, sdk, bug |
| Project | Multi-pane SDK preview |
| Initiative | Ori shell for four panes |
| Created | 2026-08-26 |
| Updated | 2026-08-27 |

## Description

The sample app we are shipping with the SDK preview crashes when it gets a fourth pane. Array sized 3 in the sample code. Embarrassing rather than interesting.

## Activity

**Ben Achilov** commented · 2026-08-27
> Fixed, and added a CI job that runs every sample in all four fold states so the next one is caught before a developer finds it.

**Ben Achilov** changed status from In Progress to Done · 2026-08-27
