# Hinge cycle test plan

| | |
| --- | --- |
| Owner | Sam Lindqvist |
| Status | Active |
| Applies to | Bellows rev C and later, all four panel builds |
| Last edited | 2026-09-01 |
| Tags | bellows, test, hardware, plan |

## Purpose

Bellows is three hinges. A folding phone that survives two years of pocket use
has to take roughly 200 open and close cycles a day without a visible crease, a
torque drift or a detent that stops feeling like a detent. This plan says what
we run, on what, and what counts as a pass.

The program acceptance gate is 200,000 cycles with no visible crease on any fold
axis and torque inside plus or minus 8 percent of nominal.

## Rigs

| Rig | Axes | Rate | Notes |
| --- | --- | --- | --- |
| Cycle bench 1 | All three hinges together | 25 cycles per minute | Slower because the fixture is heavy |
| Cycle bench 2 | Single axis, outer hinge | 40 cycles per minute | This is where B7 ran |
| Cycle bench 3 | Single axis, either inner hinge | 40 cycles per minute | Added 2026-08-30 |
| Environmental chamber | All three, 5 C to 45 C | 15 cycles per minute | Shared with the thermal plan |

## Test matrix

| Test | Unit | Cycles | Environment | Owner |
| --- | --- | --- | --- | --- |
| Outer axis life | B11, B12 | To failure or 250,000 | Ambient | Sam |
| Inner axis life | B13 | To failure or 250,000 | Ambient | Sam |
| Full assembly life | B14 | 250,000 | Ambient | Sam |
| Cold fold | B15 | 50,000 | 5 C | Sam |
| Hot fold | B15 | 50,000 | 45 C | Sam |
| Dwell open | B16 | 30 days held flat | Ambient | Sam |
| Dwell shut | B16 | 30 days held shut | Ambient | Sam |

## Acceptance

| Criterion | Pass | Marginal | Fail |
| --- | --- | --- | --- |
| Visible crease, office light | None at 200,000 cycles | Visible only under raking light | Visible at any angle |
| Torque drift from nominal | Within 8 percent | 8 to 12 percent | Over 12 percent |
| Detent force | Within 10 percent | 10 to 15 percent | Over 15 percent |
| Panel gap when shut | Under 0.3 mm | 0.3 to 0.5 mm | Over 0.5 mm |
| Particle ingress | No display artifact | Artifact clears on open | Persistent artifact |

## Inspection schedule

Inspections happen every 10,000 cycles below 200,000 and every 20,000 above it.
This changed after B7. The old interval was 20,000 throughout and it let a real
signal at 150,000 sit for a day before anyone graded it.

Every inspection records, in this order:

1. Photograph the fold axis under diffuse office light at 0, 30 and 45 degrees.
2. Photograph the same axis under raking light.
3. Measure torque at 45, 90 and 135 degrees on each axis.
4. Measure detent force at the two detent positions.
5. Measure panel gap with feeler gauges at three points.
6. Note anything that looks different, with a severity of cosmetic, watch or
   stop. A finding graded watch gets a named owner the same day.

> Severity grading is the whole point of the change. Before B7 an inspector
> could write "slight distortion" and move on. Now the word "watch" has to be
> attached to a person.

**What do we do if a unit fails early?**
Stop the rig, do not cycle further. Photograph before touching anything. Section
the panel only after the photographs and the torque log are saved. B7 taught us
that a sectioned panel with no raking light photo is half a data set.

**Can we run two tests on one unit?**
Only the dwell tests, and only after a life test has finished. Serial testing on
a unit that has already been cycled makes the numbers unreadable.

## Open items

- [ ] Second rig fixture for full assembly, one is a bottleneck
- [x] Move bench 2 off the shared bench power
- [ ] Decide whether cold fold runs before or after the life test
- [x] Add raking light lamps to bench 1 and bench 3
