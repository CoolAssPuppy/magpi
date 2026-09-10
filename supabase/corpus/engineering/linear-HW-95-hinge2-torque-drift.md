# HW-95 · Hinge 2 detent torque drifts 18% after 40k cycles

| | |
| --- | --- |
| Status | In Progress |
| Assignee | Sam Lindqvist |
| Labels | hinge, bellows, bug |
| Project | Bellows hinge durability |
| Initiative | Ship the Fold S1 to carrier certification |
| Created | 2026-08-15 |
| Updated | 2026-09-07 |

## Description

Hinge 2 is the middle hinge and takes the most travel. On B6 the detent torque dropped from 42 mNm to 34 mNm between 40k and 70k cycles, then flattened. B5 shows the same shape, smaller. Spec is 15% max drift over life.

A soft middle hinge means the phone does not hold a half-fold position, which is the pose Ori's half-fold state exists for.

## Activity

**Sam Lindqvist** changed status from Todo to In Progress · 2026-08-16

**Sam Lindqvist** commented · 2026-08-20
> Suspect the detent spring, not the cam. The spring is a flat leaf in 301 stainless and we are working it close to its fatigue knee to get the click feel Jane wants.

**Ben Achilov** commented · 2026-08-21
> If the detent goes soft, does the fold-angle sensor still read a stable half-fold? Ori decides pane layout off that reading and a wobbly one will make panes flicker between layouts.

**Sam Lindqvist** commented · 2026-08-21
> Sensor is on hinge 1, so the reading stays stable. The phone just does not stay put. It is a feel problem and a photography problem.

**Sam Lindqvist** commented · 2026-08-27
> Swapped B6 to a 17-7 PH spring at the same free height. Torque holds at 41 mNm through 60k. Click feel is slightly harder, which I prefer and Jane may not.

**Jane Okonkwo** commented · 2026-08-28
> I will try it Monday. Harder is fine, mushy is not.

**Jane Okonkwo** commented · 2026-09-01
> Tried it. Keep the 17-7.

**Sam Lindqvist** commented · 2026-09-07
> Need 100k on the new spring before I close this. Rig time is contested with the Meniscus-C run so it will be after the pilot line trip.
