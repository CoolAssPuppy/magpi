# HW-88 · Bellows cycle test rig to 200k on four units

| | |
| --- | --- |
| Status | Done |
| Assignee | Sam Lindqvist |
| Labels | hinge, bellows, test, rig |
| Project | Bellows hinge durability |
| Initiative | Ship the Fold S1 to carrier certification |
| Created | 2026-08-10 |
| Updated | 2026-09-02 |

## Description

Rig runs all three hinges together through a full fold cycle, phone to tablet to desk and back, 12 cycles per minute. Four units: B5, B6, B7, B9. Target 200,000 cycles, which is roughly 270 folds a day for two years.

Instrumented: hinge torque on all three axes, a camera on pane 2 every 5k cycles, and a chamber at 23C.

Stop conditions: torque drift over 15%, any visible fracture, any delamination.

## Activity

**Sam Lindqvist** changed status from Todo to In Progress · 2026-08-11

**Sam Lindqvist** commented · 2026-08-15
> All four past 60k. Hinge 2 torque is drifting on B6, tracking it in HW-95.

**Sam Lindqvist** commented · 2026-08-24
> B7 has a line on pane 2 at 150k. Photographing every 1k from here.

**Sam Lindqvist** commented · 2026-08-27
> B7 fractured at 180,000. Full fold line across pane 2. B5 and B9 are at 180k clean, B6 has early haze at the same location. Pulling B7 for teardown, HW-91.
>
> This kills UTG-3. See ENG-212.

**Sam Lindqvist** commented · 2026-09-02
> Rig reloaded on 29 August with the first Meniscus-C build, B11, and B12 behind it. Counter restarts from zero. Closing this one, the UTG-3 run is finished and the answer was no.

**Sam Lindqvist** changed status from In Progress to Done · 2026-09-02
