# All hands, 28 August 2026

| | |
| --- | --- |
| Notes by | Ben Achilov |
| Chaired by | Jane Okonkwo |
| Attending | All seven |
| Date | 2026-08-28 |
| Last edited | 2026-08-31 |
| Tags | all-hands, notes, company, meniscus |

Short meeting, one subject. Yesterday we reversed the outer layer decision and
Jane wanted everyone to hear the same version of why.

## The reversal

Sam took it. Unit B7 on the cycle rig showed a faint line across the panel 2
fold at 150,000 cycles. It was invisible in diffuse light and obvious under a
point source, which is how every crease starts. He kept the run going. At
180,000 the fracture propagated across the full fold line. Two of the other
three units on the rig show early haze in the same place, so B7 is not a bad
sample.

> **Decision.** Meniscus ships in Meniscus-C polymer from the Suwon vendor. This
> supersedes the 12 August choice of UTG-3. The trigger was B7 failing at
> 180,000 cycles against a 200,000 cycle spec.

Jane's line in the room was that we are not shipping a phone with a visible
crease, and that settled the discussion faster than the data did.

## What it costs us

Hardness drops from 7H to 4H. The outer panel is softer than glass and a key in
the same pocket will eventually mark it. Sam has run the coin drag rig and the
mark is shallow and does not catch a fingernail. We will argue again about
whether a screen protector goes in the retail box.

The change also means a new lamination profile, the edge seal moves in 0.4 mm,
and the anti fingerprint coating is a different chemistry, so the whole cosmetic
spec gets re-measured. Sam estimates six days of his own time.

The AR stack goes on polymer instead of glass and the Suwon vendor runs both
lines, so that part is a purchase order.

## Why it happened on Thursday and not next week

John pointed out on Wednesday that the tooling commit was Monday, and a material
change after that meant paying for a mask set we throw away. So the decision
moved to the same day rather than the following week. Dana reordered the polymer
die on Friday.

## Everything else, quickly

- Ori is unaffected. Same panel, same resolution, same geometry. The state
  machine needs no edit and I confirmed that with Sam.
- Certification work is unaffected. The outer panel is not in the RF path.
- Maya took the launch planning conversation offline with the marketing group.
- Dana said the pilot line slot holds.

## Actions

- [x] Sam updates the outer layer decision record with both decisions
- [x] Dana reorders tooling for the polymer die
- [x] Ben confirms Ori needs no change
- [ ] Second source for the polymer, still open
- [x] Sam restarts the cycle count on a Meniscus-C unit

**Somebody asked why we keep the UTG-3 decision in the page at all.**
Because in six months a part number from that decision will turn up in a bill of
materials and somebody will need to know in ten seconds why it is there and why
it is wrong. Jane was firm about this.
