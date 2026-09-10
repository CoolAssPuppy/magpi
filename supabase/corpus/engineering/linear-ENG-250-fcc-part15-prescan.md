# ENG-250 · FCC Part 15B pre-scan, three fold states

| | |
| --- | --- |
| Status | In Progress |
| Assignee | Ben Achilov |
| Labels | certification, rf, test |
| Project | FCC and carrier certification |
| Initiative | Ship the Fold S1 to carrier certification |
| Created | 2026-08-21 |
| Updated | 2026-09-08 |

## Description

Radiated emissions pre-scan at the local chamber before we book the real lab. A folding device has to pass in every mechanical state, so we scan closed, half fold and fully open. Three states times three orientations is a long day.

The worry is the display flex through hinge 2. It runs 8 lanes at 2.5 Gbps beside a graphite sheet that is now a nice antenna.

## Activity

**Ben Achilov** changed status from Todo to In Progress · 2026-08-24

**Ben Achilov** commented · 2026-08-26
> Closed and half fold pass with 6dB margin. Fully open has a 3.1dB exceedance at 875MHz, horizontal polarisation. It only appears fully open, which points straight at the hinge 2 flex being a half wave at that geometry.

**Sam Lindqvist** commented · 2026-08-26
> The graphite bridge went in the same week. Coincidence is unlikely. Try it with the graphite removed and tell me how much thermal headroom I have to buy back your margin.

**Ben Achilov** commented · 2026-08-27
> Graphite removed: exceedance drops to 0.4dB, still there. So the graphite makes it worse and is not the cause.

**Ben Achilov** commented · 2026-09-02
> Added a ferrite on the flex at the hinge 2 exit and grounded the graphite at both ends instead of one. Fully open now passes with 4.2dB margin at 875MHz. Grounding at both ends was the fix, the ferrite bought maybe 0.5dB.

**Sam Lindqvist** commented · 2026-09-02
> Grounding the graphite at both ends means a second contact spring inside the hinge. Doable, I need to move a screw boss. Add it to the pilot line drawing package before the trip.

**Ben Achilov** commented · 2026-09-08
> Re-scan on the fixed build passes everything with 4dB or better. Booking the accredited lab for the week of 21 September. Leaving this open until the real numbers come back.
