# ORI-38 · Continuity contract for third party apps

| | |
| --- | --- |
| Status | In Progress |
| Assignee | Ben Achilov |
| Labels | ori, continuity, sdk, spec |
| Project | App continuity |
| Initiative | Ori shell for four panes |
| Created | 2026-09-01 |
| Updated | 2026-09-08 |

## Description

Write down what an app is promised across a fold and what it has to do to keep it. Draft:

1. Your process is never killed by a fold. Ever. If it is, that is our bug.
2. You get `onPaneChange` before the new size is committed, with old and new pane geometry.
3. Anything you put in the continuity bundle comes back on the other side, up to 512KB.
4. If you do nothing at all, you get resized and that is all you get.

Rule 1 is the one that matters and the one that will be hardest to keep on a device with 12GB.

## Activity

**Ben Achilov** commented · 2026-09-03
> Rule 1 costs us. Keeping every folded-away app resident means the low memory killer has less to work with, and the four pane case has more apps live at once than any phone.

**Jane Okonkwo** commented · 2026-09-04
> Keep rule 1. An app that dies when you open the phone makes the hinge feel broken, and the hinge is the product.

**Ben Achilov** commented · 2026-09-08
> Rule 1 stays. I am adding a memory pressure signal apps can listen to so a well behaved app can shrink instead of dying. Draft is in the SDK preview docs.
