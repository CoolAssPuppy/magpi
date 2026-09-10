# ENG-205 · Define the crease visibility metric

| | |
| --- | --- |
| Status | Done |
| Assignee | Sam Lindqvist |
| Labels | display, meniscus, spec |
| Project | Meniscus outer layer |
| Initiative | Ship the Fold S1 to carrier certification |
| Created | 2026-08-10 |
| Updated | 2026-08-19 |

## Description

Four of us have argued about whether a fold line is visible and we have four different lighting setups in our heads. Write down one procedure and one number so a pass is a pass.

Proposal: measure local gloss deviation across the fold line with a 60 degree gloss meter, five points, report max deviation from the flat area of the same pane. Pass is under 2.5 GU.

## Activity

**Ben Achilov** commented · 2026-08-13
> Gloss deviation correlates with what a person sees only under a point source. Half the complaints in reviews of folding phones are about diffuse office light. Add a second test: 3000K diffuse panel at one meter, three people, eyes at 40cm, does anyone find the line without being told where it is.

**Sam Lindqvist** commented · 2026-08-14
> A three person eyeball test is not a spec.

**Ben Achilov** commented · 2026-08-14
> It is the only one that matches the thing we are being judged on. Keep the gloss meter as the gate and the eyeball test as the veto.

**Jane Okonkwo** commented · 2026-08-18
> Do both. Gloss meter number goes in the supplier contract, the eyeball test goes in our own release checklist. Sam owns the first, Ben owns the second.

**Sam Lindqvist** commented · 2026-08-19
> Written up. Gloss deviation under 2.5 GU is the contractual gate. The diffuse panel test with three observers is an internal blocker for release builds. Both procedures are in the Notion display spec page.

**Sam Lindqvist** changed status from In Progress to Done · 2026-08-19
