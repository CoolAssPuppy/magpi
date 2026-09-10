# All hands, 8 September 2026, special session

| | |
| --- | --- |
| Notes by | Priya Raghunathan |
| Chaired by | Jane Okonkwo |
| Attending | All seven |
| Date | 2026-09-08 |
| Last edited | 2026-09-08 |
| Tags | all-hands, notes, company, certification |

Off cadence. The next scheduled all hands is 11 September and Jane moved it
forward three days because the test house booking starts on the 14th and she
wanted everyone looking at the same readiness list before the weekend.

## Certification readiness

Ben has four of six fold states pre scanned. COVER, PHONE and DESK pass. BOOK
has one marginal band at the low end with about 1.5 dB of margin, which he
thinks is the ground plane split across the middle hinge. LAPTOP and TENT are
not scanned yet and that is the gap.

Thermal has one real failure. Shut and charging at 35 C ambient reaches 44.1 C
skin against a 43 C limit. The fix is firmware, tapering charge power when the
device is shut and the skin sensor passes 40 C. It costs charge speed in a
pocket and everyone in the room accepted that trade in about fifteen seconds.

| Item | State | Owner |
| --- | --- | --- |
| RF pre scan, four states | Done | Ben |
| RF pre scan, LAPTOP and TENT | Not started | Ben |
| Ground plane fix for BOOK | Investigating | Sam |
| Charge taper firmware | In 0.7.8 | Ben |
| Golden units shipped to the lab | Not started | Dana |

## Hardware

Meniscus-C is holding. B11 is past 120,000 cycles on the rig with nothing
visible under raking light. Sam expects to reach the 200,000 mark shortly after
the lab date. Two incoming polymer lots have both come back clean, and the curl
number is trending up slightly, which Sam is watching without being worried
about it yet.

Second source for the polymer is still open. Jane asked for a date on that and
Sam said he would have vendor conversations started but not finished by the end
of the month. Dana owns the vendor side.

## Manufacturing

Dana walked through the pilot line readiness. The polymer die arrived, the
fixture change is scheduled, and the incoming inspection runbook is being used
on every lot rather than by sampling. Four clean lots in a row moves us to
sampling and we are at two.

## Marketing

Maya gave a status without detail in the room, because most of what marketing is
working on right now is under wraps and the group agreed there was no reason to
walk through it in an all hands. Priya has the messaging FAQ and the naming
question resolved. The short version of the naming answer: Meniscus, Bellows and
Ori are internal words and no customer will ever see them.

## Finance

John said the September numbers land next week and that nothing has moved in a
direction that worries him. He asked again that anything with a cost consequence
comes to him before it is decided rather than afterwards, and pointed at the
outer layer
reversal as the good example: he flagged the tooling commit deadline on the
Wednesday and the decision moved to the Thursday.

## Decisions

- Test house booking on the 14th is fixed. Everything else moves around it.
- Charge taper ships in 0.7.8 and every unit going to the lab runs it.
- Internal component names stay internal.

## Actions

- [ ] Ben scans LAPTOP and TENT before the 12th
- [ ] Dana ships two golden units and one spare
- [ ] Sam gets the BOOK band margin above 3 dB or tells us it cannot be done
- [x] Priya closes the naming question
- [ ] Sam starts the second source conversation
