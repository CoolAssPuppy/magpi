# Meniscus outer layer, the reversal to Meniscus-C, engineering write-up

Sam Lindqvist
2026-08-27
Related: ENG-212, HW-88, HW-91, and the outer layer decision record

## What changed today

Meniscus, the outer layer of the Fold S1, changes from UTG-3 ultra-thin glass,
30 micron, Kyoto vendor, to Meniscus-C polymer, 62 micron, Suwon vendor.

This reverses the choice of 12 August. That choice was made on hardness and on
the vendor's published cycle claim, with our own data limited to A-series
coupons that only ran to 80,000 cycles. The B-series ran further and produced
the data we did not have two weeks ago.

Decided in the hardware review this morning. Present: me, Ben, Jane, with John
for the last ten minutes. Jane approved it in the room. The decision record has
both decisions in it and the August one is marked superseded rather than
deleted, because a part number from it will turn up in a bill of materials in
six months and somebody will need to know in ten seconds why it is wrong.

## The trigger

Unit B7 fractured its UTG-3 outer layer at 180,000 cycles against a 200,000
cycle gate, across the panel 2 fold. The line was visible under a point source
at 150,000 and I kept the run going to see how it ended. Unit B6 has haze at
the same location and fails the gloss gate at 2.9 GU without having fractured.

Two units out of four, same location, same progression. The teardown puts the
origin in the hard coat at the tightest part of the bend, and our bend radius
of 3.2 mm is inside a datasheet envelope that stops at 4.0 mm.

## The comparison

Data below mixes our measurements with vendor measurements and I have marked
which is which. The polymer numbers on cycles are from the Suwon rig, not ours,
and that is the weakest row in the table.

| Property | UTG-3 glass | Meniscus-C polymer | Source |
| --- | --- | --- | --- |
| Thickness | 30 micron | 62 micron | vendor, both |
| Cycles to visible crease | 180,000 on B7, haze on B6 | 200,000 with no visible crease | ours for glass, Suwon rig for polymer |
| Qualified bend radius | 4.0 mm | 2.8 mm | vendor datasheets |
| Pencil hardness with hard coat | 7H | 4H | vendor, both, ASTM D3363 |
| Haze, flat | 0.3 percent | 0.4 percent | vendor |
| Haze after 200,000 cycles | not reached | under 0.9 percent claimed | Suwon, unverified by us |
| Lead time | 9 weeks | 6 weeks | vendor, both |
| Feel under a thumb, blind ranking | preferred 7 of 9 | preferred 2 of 9 | ours, nine people in this office |

Glass wins on hardness, on optics and on how it feels. Polymer wins on the two
things that decide whether the product works at all, which are whether the
outer layer survives H1 and whether a person sees a line down the middle of
their phone after a year.

We also looked at Meniscus-B, the previous polymer generation, which reaches
210,000 cycles and comes in at 3H. It was rejected on scratch complaints in the
A sample review and nothing about today changes that.

## What we gave up, plainly

A key in the same pocket will eventually mark the outer panel. I ran the coin
drag rig on the sample lot coating and the mark is shallow and does not catch a
fingernail. That is a real cost and we chose it on purpose, because a scratch a
user has to hunt for is a smaller problem than a crease every user sees.

The 4H number comes from the sample lot coating and not from the production
anti-fingerprint chemistry that Suwon switched to in July. ENG-221 re-runs it
on five production coupons. If it comes back under 4H we are having the screen
protector conversation again, this time with a number in it.

## What this costs in work

- Drop programme restarts. Polymer distributes impact differently and the glass
  rounds do not carry over.
- New lamination profile, edge seal moves in 0.4 mm, whole cosmetic spec
  re-measured because the coating chemistry changes. About six days of my time.
- Cycle count restarts from zero on the first Meniscus-C build, B11.
- Haze re-measured on our own meter at our own radius, because the Suwon number
  is theirs. ENG-218.
- Tooling: the polymer die is a different fixture. Dana reordered on 28 August.
- Ori is unaffected. Same panel, same resolution, same geometry, and Ben
  confirmed the state machine needs no edit.
- Certification is unaffected. The outer panel is not in the RF path.

## What would reverse this decision

Writing this down because a decision without a reversal condition is half a
decision.

1. B11 or B12 fails the gloss gate below 200,000 cycles on our rig. Both are on
   from 29 August and I will know inside a month.
2. Production coating comes back under 4H in ENG-221 and the coin drag mark
   catches a fingernail.
3. Haze on our own meter goes over the 1.2 percent spec through the cycle run.

How it feels under a thumb is not on that list, and it is the thing most likely
to be raised.

## Open

Second source for Meniscus-C. One vendor is one vendor, and the vendor that
makes the outer layer also runs the AR line, so a bad month there stops the
whole device. Dana owns the commercial side and I owe her the technical
requirements by the end of next week.
