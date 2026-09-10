# HW-134 · Binning plan for hinge torque at end of line

| | |
| --- | --- |
| Status | In Progress |
| Assignee | Sam Lindqvist |
| Labels | manufacturing, pilot, yield, test |
| Project | Yield and binning |
| Initiative | Build the pilot line |
| Created | 2026-08-31 |
| Updated | 2026-09-08 |

## Description

Hinge detent torque has a wider distribution than we would like coming off the assembly fixture, roughly plus or minus 6 mNm around 42. A unit at the bottom of that range feels loose in the hand and a unit at the top is stiff enough that people think it is broken.

Proposal: measure all three hinges at end of line, pass 36 to 48 mNm, and inside the pass window sort into A and B by spread across the three hinges. A units go to reviewers and carriers. B units go to internal use.

The alternative is tightening the spring tolerance, which costs money at the vendor and which nobody has priced.

## Activity

**Ben Achilov** commented · 2026-09-02
> The end of line rig can log the torque per hinge per serial without extra hardware. I will write it into the test script so we get the distribution from the pilot build for free.

**John Mbeki** commented · 2026-09-03
> Before you build a sorting process, get a price on the tighter spring. If a sorted line means two grades of finished goods and a scrap bin, that is a cost with a different shape and I would rather see both numbers.

**Sam Lindqvist** commented · 2026-09-08
> Asked the spring vendor. Answer comes back next week. Pilot build logs torque either way so we will have real distribution data to argue with instead of my estimate.
