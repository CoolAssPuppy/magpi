# Outer axis life test, UTG-3 B-series, final report

Sam Lindqvist
2026-08-28
Run window 2026-08-11 to 2026-08-27
Units B5, B6, B7, B9
Related: HW-88, HW-91, ENG-212, and the outer layer decision record

## Summary

Four B-series units were cycled on the outer hinge with UTG-3 ultra-thin glass
as the Meniscus outer layer. The run was stopped on 27 August at 180,000 cycles
against a 200,000 cycle acceptance gate.

One unit fractured. Unit B7 developed a faint line across the panel 2 fold at
150,000 cycles, held it through two inspections, and propagated a full-width
fracture at 180,000. A second unit, B6, shows haze at the same location and
fails the gloss gate without having fractured. Two units, B5 and B9, finished
at 180,000 clean on both the gloss meter and the observer test.

Half the population showed the failure at 90 percent of the acceptance gate.
That is the whole finding and everything below is the evidence for it.

## Method

Two phases, and the counts below are combined across both. The move is in the
rig log and it is the weakness of this data set, so I am putting it at the top
rather than in a footnote.

Phase one, to about 72,000 cycles. Cycle bench 1, all three hinges driven
together through the full fold, phone to tablet to desk and back, 12 cycles per
minute, chamber at 23 C. All four units together.

Phase two, from 72,000 to the end. Cycle bench 2, outer axis, H1 driven alone
through 0 to 180 degrees, 40 cycles per minute, chamber at 23 C and 45 percent
relative humidity. The units moved to bench 2 on 18 August, the morning after
the chamber interlock halt, because the single axis bench gives three times the
rate and H1 is the hinge under the material we were testing.

Bend radius at the fold is 3.2 mm on both benches, which is the industrial
design number and is fixed.

Inspection every 20,000 cycles for the first part of the run, moving to every
10,000 below 200,000 after B7 produced a finding at 150,000 that sat for a day
before anyone graded it. Each inspection records the fold axis under diffuse
office light at 0, 30 and 45 degrees, the same axis under raking light, torque
at 45, 90 and 135 degrees, detent break-out force at both detents, and panel
gap at three points.

Crease is graded by the ENG-205 procedure. Gloss deviation across the fold line
on a 60 degree meter, five points, maximum deviation from the flat area of the
same panel. The contractual gate is under 2.5 GU. The internal blocker is the
observer test: 3000K diffuse panel at one metre, three people, eyes at 40 cm,
does anyone find the line without being told where it is.

The 200,000 cycle gate is 270 folds a day for two years.

## Results

| Unit | Cycles at stop | Gloss deviation at fold, GU | Observers who found the line, of 3 | Outcome |
| --- | --- | --- | --- | --- |
| B5 | 180,000 | 1.4 | 0 | Clean |
| B6 | 180,000 | 2.9 | 2 | Fail, gloss gate, early haze |
| B7 | 180,000 | not measurable after fracture | 3 | Fail, fracture |
| B9 | 180,000 | 1.1 | 0 | Clean |

## B7 inspection log

| Cycles | Date | Finding | Severity |
| --- | --- | --- | --- |
| 50,000 | 2026-08-22 | Clean | none |
| 100,000 | 2026-08-23 | Clean | none |
| 150,000 | 2026-08-24 | Faint line across the panel 2 fold. Invisible in diffuse light, obvious under a point source. Gloss deviation 2.1 GU. | watch |
| 160,000 | 2026-08-25 | Line holds, early haze at the same location. 2.4 GU. | watch |
| 170,000 | 2026-08-26 | Haze growing, 2.8 GU, over the gate. Teardown opened as HW-91. | stop pending |
| 180,000 | 2026-08-27 | Fracture propagated across the full fold line. Rig stopped. | stop |

## Torque through the run

H1 measured at 90 degrees. Nominal is 79 mNm and the spec allows 8 percent
drift across the 200,000 cycle life.

| Unit | 0 | 60,000 | 120,000 | 180,000 | Drift |
| --- | --- | --- | --- | --- | --- |
| B5 | 79.4 | 78.1 | 76.9 | 75.8 | 4.5 percent |
| B6 | 78.8 | 77.2 | 76.0 | 74.6 | 5.3 percent |
| B7 | 79.1 | 77.8 | 76.4 | 74.4 | 5.9 percent |
| B9 | 79.6 | 78.4 | 77.3 | 76.2 | 4.3 percent |

Every unit is inside spec, including the one that fractured. Detent break-out
force at D1 and D2 moved less than 4 percent on all four units. H2 on B6 drifts
faster than the rest of the population and is tracked separately in HW-95. It
is unrelated to this failure and I want that said plainly, because the two got
discussed in the same meeting twice. The mechanism
held. The failure is in the material laminated to it, which is the good news,
because the mechanism is the part we cannot change in six weeks.

## Why the glass failed

Our bend radius at the fold is 3.2 mm. The UTG-3 datasheet qualifies the
material to 4.0 mm and the vendor published nothing below that. We read their
cycle claim as a property of the material. It is a property of the material at
the radius they tested, which is a different sentence.

The teardown in HW-91 puts the origin in the hard coat, about 8 mm from the
fold centreline on the outboard side, which is where the bend is tightest. The
glass core cracked afterwards, following the hard coat. A bare UTG-3 coupon on
the same rig fractured at 195,000, so the coating is not the cause and taking
it off does not buy enough.

## What I recommend, and what happened

I recommended stopping UTG-3 rather than trying to inspect our way past it.
Opening the bend radius to 4.0 mm adds roughly 0.4 mm of folded thickness per
millimetre of radius and puts the shut device over 15 mm, which is a new shell
tooling programme. Jane called that too expensive in schedule terms on 26
August.

The outer layer changed to Meniscus-C polymer on 27 August. The rig was
reloaded on 29 August with B11 and B12 and the counter restarts from zero.

## Files

Rig logs, per-unit inspection photographs under both lighting conditions, the
gloss meter traces and the B7 cross sections are in the lab share under the B7
folder. B7 itself is bagged, tagged and not to be handled further, because I
want it intact when someone asks me in six months whether we were sure.
