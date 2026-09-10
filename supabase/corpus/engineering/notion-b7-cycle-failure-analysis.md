# B7 cycle failure analysis

| | |
| --- | --- |
| Owner | Sam Lindqvist |
| Status | Closed |
| Unit | B7, UTG-3 outer panel, Bellows rev C hinge set |
| Failure date | 2026-08-27 |
| Last edited | 2026-08-29 |
| Tags | display, meniscus, bellows, test, postmortem |

## Summary

B7 accumulated 180,000 open and close cycles on the rig before the fold line on
panel 2 fractured through. Spec for a two year life is 200,000. The panel is the
failure, the hinge is fine.

> The crease starts as microfracture in the hard coat over the fold line and
> propagates across the full width. The hard coat is the layer we cannot repair.
> There is no fix inside the current bend radius.

## Test conditions

| Parameter | Value |
| --- | --- |
| Rig | Cycle bench 2, outer hinge only |
| Rate | 40 cycles per minute |
| Ambient | 23 C, 45 percent RH |
| Fold angle | 0 to 180 degrees |
| Bend radius at fold | 3.2 mm |
| Inspection interval | Every 20,000 cycles |
| Panel | UTG-3, 30 micron, AR stack applied |

## Inspection log

| Cycle count | Date | Finding |
| --- | --- | --- |
| 50,000 | 2026-08-22 | Clean |
| 100,000 | 2026-08-23 | Clean |
| 150,000 | 2026-08-24 | Faint line across the panel 2 fold. Diffuse light, invisible. Point source, obvious. |
| 160,000 | 2026-08-25 | Line holds, early haze at the same location |
| 170,000 | 2026-08-26 | Haze growing. Teardown opened as HW-91. |
| 180,000 | 2026-08-27 | Fracture propagated across the full fold line. Test stopped. |

## Root cause

Our bend radius at the fold is 3.2 mm. The UTG-3 datasheet qualifies the
material down to 4.0 mm and the vendor never published a number below that. We
read the vendor cycle claim as a property of the material. It is a property of
the material at the radius they tested.

Three of the four units on the rig reached 180,000. Two of those three show haze
at the same location on panel 2, so B7 is the first one through a door all of
them were walking towards.

**Was the hinge a contributing factor?**
No. Bellows rev C torque was inside spec at every inspection and the hinge came
off the rig with no measurable change in detent force. The hinge did its job.
HW-95 tracks a separate torque drift question on hinge 2 and it is unrelated to
this failure.

**Did the AR stack matter?**
No. A bare UTG-3 coupon on the same rig fractured at 195,000 cycles, inside the
same band. The coating is not the cause and removing it does not buy enough.

**Could a thicker panel help?**
Thicker glass creases sooner at a fixed radius. Going the other way, 20 micron
UTG is available but handling yield on the pilot line would be bad and Dana was
clear about that.

## What we changed

- [x] Reverse the outer layer decision to Meniscus-C polymer
- [x] Move the crease inspection interval to every 10,000 cycles under 200,000
- [x] Add raking light inspection to the standard checklist so cosmetic
      observations get a severity instead of a shrug
- [ ] Write the vendor datasheet reading rule into the component selection page
- [x] Build B11 on Meniscus-C and restart the count

## Artifacts

| Item | Where |
| --- | --- |
| Sectioned panel photos | Lab drive, B7 folder |
| Teardown writeup | HW-91 |
| Rig log CSV | Lab drive, B7 folder |
| Vendor datasheet, UTG-3 rev 4 | Component library |
| Coupon test log | Lab drive, coupons folder |
