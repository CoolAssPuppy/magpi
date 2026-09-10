# ENG-254 · SAR in half fold is not covered by our test plan

| | |
| --- | --- |
| Status | In Progress |
| Assignee | Ben Achilov |
| Labels | certification, rf, compliance |
| Project | FCC and carrier certification |
| Initiative | Ship the Fold S1 to carrier certification |
| Created | 2026-08-25 |
| Updated | 2026-09-04 |

## Description

The test plan we inherited from the two panel prototype has body-worn and head positions for closed and open. Half fold is a position a person actually uses, holding it like a small book against the body, and the antenna geometry in that state is different from both.

Need the lab to add half fold at 0mm and 15mm separation, all bands.

## Activity

**Ben Achilov** commented · 2026-08-25
> Asked the lab. They will do it, it adds a day and a half of chamber time.

**Jane Okonkwo** commented · 2026-08-26
> Add the day. Failing SAR after we have booked carrier lab slots would be the expensive version of saving it.

**Ben Achilov** commented · 2026-09-04
> Test plan revision 4 sent to the lab, half fold included. Simulation says worst case is half fold at 15mm on band n77, 1.42 W/kg against a 1.6 limit. Tight but inside.
