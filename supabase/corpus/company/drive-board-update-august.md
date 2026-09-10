# Board update, August 2026

Jane Okonkwo, CEO
2026-08-28

## Where we are

The Fold S1 is pre-production. We have a small fleet of B-series units built on
the second tooling set, all four panels live, all three Bellows hinges
assembled to the production revision rather than the bench revision we were
using in July. Ori runs the full panel handoff on every one of them. A person
can now pick up a Fold S1, open it from phone to tablet to the full desk-sized
surface, and use it for a day without a member of the hardware team standing
next to them.

That is the good half of the month.

## The outer layer decision reversed

On 12 August we picked UTG-3 ultra-thin glass for Meniscus, the outer layer.
The decision was recorded, the vendor was told, and we started ordering long
lead parts against it.

Yesterday we reversed it. Meniscus is now Meniscus-C polymer.

The cause is in the hinge cycle test. Unit B7 showed a faint line across the
panel 2 fold at 150,000 cycles, invisible in office light and obvious under a
point source. Sam kept the run going. At 180,000 cycles the fracture propagated
across the full fold line, against a spec of 200,000 cycles, which is two years
of ordinary folding. Two of the other three units on that rig show early haze
in the same place, so this is a property of the material at our bend radius and
not a bad sample.

The teardown found the crack starting in the hard coat, about 8 mm from the
fold centreline where the bend is tightest. Our bend radius is 3.2 mm. The
UTG-3 datasheet qualifies the material to 4.0 mm and the vendor never claimed
otherwise. We read that datasheet optimistically in August and the cycle rig
corrected us.

I want to be plain about what this costs us. We lose the ordering position on
the glass, we restart the drop programme because a polymer outer layer fails
differently, and we re-measure the whole cosmetic spec because the anti
fingerprint chemistry changes with the material. We also get two things back.
The crease is measurably shallower on polymer, and the crease is the single
thing a reviewer will put a thumb on in the first ten seconds of a hands-on.
Polymer also has a shorter lead time than the glass did, which bought back
about two weeks.

I would rather explain a schedule change to you than explain a cracking phone
to a certification lab.

## Manufacturing

Dana has the pilot line in Shenzhen holding a slot that assumes the polymer
parts arrive on the revised schedule. The polymer die is reordered. The vendor
has confirmed capacity in writing. They have not confirmed the date in writing,
which is the distinction I keep asking her to hold them to.

We are single sourced on the outer layer, on the hinge steel and on the panel
driver. Qualifying a second source for any of them takes longer than the time
we have before the pilot line runs, so the plan is to carry that risk and be
loud about carrying it. Dana is writing one page per exposed part.

## Certification

Ben has the test house booked and most of the fold states pre-scanned. Two
things are open. One radio band in the three panel state is marginal by about
1.5 dB, which he thinks is the ground plane split across the middle hinge, and
Sam is looking at a shield change that does not move the tooling.

Thermal is the other. A four panel device with every panel lit has nowhere to
put the heat, and in the worst case we are at the skin limit rather than under
it. Ben has firmware work in progress that dims panels nobody is looking at,
which buys back more than the limit needs. The version of that behaviour a
person actually notices is the part still being tuned.

## People

Seven of us. Nobody has left, nobody new has started, and I am not hiring
before the pilot line runs.

The load is unevenly distributed and I know it. Sam has run the hinge
programme, the display programme and a material reversal inside one month. Dana
is doing supplier management and manufacturing operations as one job. If you
hear one thing from this update that is not about the product, hear that.

## Risks, honestly ranked

1. The polymer qualification finds something we have not seen yet. We have a
   vendor rig number and days of our own cycle data on the first Meniscus-C
   unit, against three months of work on the glass.
2. The vendor date slips and the pilot line slot slips with it.
3. Thermal or the marginal radio band fails at the test house and the fix is
   mechanical rather than firmware.
4. We run out of runway before the line runs. John has the detail and has
   walked the Finance members of the board through it separately.

## What I want from you

Nothing this month, other than that you read the engineering write-up rather
than my summary of it. The next board meeting is where I bring the
manufacturing commitment and the number that comes with it.
