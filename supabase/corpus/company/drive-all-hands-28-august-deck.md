# All hands, 28 August 2026, the deck written out

Jane Okonkwo
2026-08-28

Ben took the minutes. This is the deck I presented from, written out, because
two of the seven of us were on a video call and the slides were unreadable at
that size. If you were in the room, this is what was on the wall behind me.

## Slide 1. One sentence

We reversed the biggest material decision on the product yesterday, four days
before the tooling commit, and we were right to.

## Slide 2. What Meniscus is now

Meniscus-C polymer, from the Suwon vendor.

If you have a spec sheet, a slide, a supplier email or a Linear ticket that says
UTG-3 glass, it is out of date. The decision record has both decisions in it and
ENG-212 is the supplier thread.

The short version for anyone who has not been living in it. The outer layer is
the part you touch when the phone is shut. It takes every open and close of H1,
the outer hinge, which is the hinge with the harshest duty in the device. Glass
felt better under a thumb and it cracked. Polymer creases less and scratches
more. We chose the failure we can live with.

## Slide 3. The number that made the decision

180,000.

That is the cycle count where unit B7 fractured across the panel 2 fold line.
The spec is 200,000 cycles, which is roughly 270 folds a day for two years. The
line was faint and only visible under a point source at 150,000. Sam kept the
run going, which is why we know how it ends rather than guessing.

Two of the other three units on that rig show early haze in the same place. B7
went through a door all of them were walking towards.

## Slide 4. Why it happened on a Thursday

The tooling commit was Monday. John pointed that out on Wednesday afternoon. A
material change after a tooling commit means paying for a fixture we throw away,
so the decision moved to the same week rather than the following one.

I want to name that, because it is the best thing that happened this month.
Finance saw a deadline that hardware did not, said so early enough to matter,
and the decision got better because of it.

## Slide 5. What changed for each of you

Hardware: the drop programme restarts. Polymer distributes impact differently
and the glass results do not carry over. Sam also has a new lamination profile,
an edge seal that moves 0.4 mm, and a cosmetic spec to re-measure.

Firmware: nothing. Same panel, same resolution, same geometry. Ben confirmed
the Ori state machine needs no edit and I want that written down where people
can find it, because three people asked him separately.

Marketing: every asset shot on a glass unit shows a device we no longer make.
Maya and Priya have the re-shoot conversation and the word glass appears in
more places than anyone expected.

Supply chain: Dana has the glass order to unwind and the polymer die to
reorder, at the same time, with two vendors who both know we are in a hurry.

Finance: John is re-running the model. He will bring it to the people who need
it.

## Slide 6. Ori

Ori shipped panel handoff this month. Open the device from phone to tablet to
desk and the app you were looking at is there, in the right place, without a
flash of the wrong layout. That took weeks and I do not think enough of us said
anything about it at the time.

Ben demoed it live and it worked, which is more than my demos do.

## Slide 7. What is hard right now

Thermal in the four panel case. All four panels lit, the SoC working, and
nowhere for the heat to go. We are at the skin limit rather than under it, and
Ben has per-panel backlight work in progress that gets us back.

The second source for the polymer. One vendor is one vendor.

The crease. It is better on polymer and under a point source at the right angle
you can still find it if you know where to look. Someone who wants to find it
will find it, and we should hand them the photograph rather than let them think
they caught us.

## Slide 8. What I am asking for

Write things down where the rest of us can find them, on the day. We are seven
people and we already have one decision living in three tools under three
names. The glossary exists for exactly this.

Second, if you are the only person who knows something, you are a risk to the
company rather than a hero of it.

## Slide 9. Next

The pilot line, the certification block, and the two things I cannot walk
through in a room this size but which each of you can see from where you sit.

Questions ran about twenty minutes past the end. The one I could not answer
well was Dana's, which was whether we would reverse a decision this size again
in October. The honest answer is that we would if the data said so, and that I
do not know how we would pay for it.
