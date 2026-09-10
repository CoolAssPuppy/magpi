# ORI-14 · Define what a pane is

| | |
| --- | --- |
| Status | Done |
| Assignee | Ben Achilov |
| Labels | ori, shell, spec, decision |
| Project | Pane manager |
| Initiative | Ori shell for four panes |
| Created | 2026-08-10 |
| Updated | 2026-08-18 |

## Description

Three of us use the word pane for three different things: a physical panel, a region an app is drawn into, and a window. The pane manager cannot be written until the word means one thing.

Proposal:

- **Panel** is hardware. There are four, they do not move, they are numbered 1 to 4 from the hinge 1 side.
- **Pane** is a region the compositor hands to an app. A pane is one or more whole panels. There are never two panes on one panel.
- **Window** does not exist in Ori. An app gets panes.

The rule that a pane cannot be a fraction of a panel is the part worth arguing about, because it means no side by side on a single panel, ever.

## Activity

**Ben Achilov** changed status from Todo to In Progress · 2026-08-11

**Sam Lindqvist** commented · 2026-08-12
> A panel is 6.1 inches. Splitting one gives you two 3 inch columns nobody can read. Agree with the rule for hardware reasons and not for software ones.

**Jane Okonkwo** commented · 2026-08-13
> What happens when a developer wants a list on the left and a detail view on the right, on one panel, like every tablet app ever written.

**Ben Achilov** commented · 2026-08-13
> They draw both inside their pane and we do not care. The rule is about what the compositor owns, not about what an app draws inside its own rectangle.

**Jane Okonkwo** commented · 2026-08-14
> Fine. Then say that in the SDK docs in those words, because the first thing every developer will assume is that we banned split views.

**Ben Achilov** commented · 2026-08-18
> Written up in the Ori architecture page. Panel, pane, no windows, a pane is whole panels only. Ported the vocabulary through the compositor code, which was 40 renames and one real bug where a pane index was used as a panel index in the fold handler.

**Ben Achilov** changed status from In Progress to Done · 2026-08-18
