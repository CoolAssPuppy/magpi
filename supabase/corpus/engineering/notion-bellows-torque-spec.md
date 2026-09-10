# Bellows torque and detent spec

| | |
| --- | --- |
| Owner | Sam Lindqvist |
| Status | Approved |
| Revision | C.4 |
| Last edited | 2026-08-22 |
| Tags | bellows, hardware, spec |

## Scope

Bellows is the hinge assembly, all three hinges taken together. This page fixes
the torque curve, the detent positions and the tolerances the pilot line
inspects against. It says nothing about the shell or the display stack.

## Hinge naming

| Hinge | Position | Connects |
| --- | --- | --- |
| H1 | Outer | Panel 1 to panel 2 |
| H2 | Centre | Panel 2 to panel 3 |
| H3 | Inner | Panel 3 to panel 4 |

H1 folds the opposite way from H2 and H3. That is what makes the four panel
stack close flat instead of into a wedge, and it is also why H1 sees the
harshest duty and why B7 ran on H1.

## Torque

| Angle | H1 nominal | H2 nominal | H3 nominal | Tolerance |
| --- | --- | --- | --- | --- |
| 15 degrees | 68 mNm | 61 mNm | 61 mNm | plus or minus 8 percent |
| 45 degrees | 74 mNm | 66 mNm | 66 mNm | plus or minus 8 percent |
| 90 degrees | 79 mNm | 70 mNm | 70 mNm | plus or minus 8 percent |
| 135 degrees | 74 mNm | 66 mNm | 66 mNm | plus or minus 8 percent |
| 165 degrees | 66 mNm | 60 mNm | 60 mNm | plus or minus 10 percent |

The curve is deliberately flat. A user opening the device one panel at a time
should feel the same resistance the whole way, so the phone stays where it is
put at any angle.

## Detents

| Detent | Angle | Force to break out | Purpose |
| --- | --- | --- | --- |
| D1 | 90 degrees | 96 mNm | Laptop posture, panel 1 and 2 |
| D2 | 180 degrees | 88 mNm | Flat, all panels |

There is no detent on H3. Product decided in the July review that a detent on
every hinge made the device feel notchy, and that decision stands.

> **Approved.** Rev C.4 is the tooling revision. Any change from here goes
> through the engineering review process and needs Jane on it, because a hinge
> change moves the pilot line date.

**What happens to torque over life?**
Torque drifts down. The spec allows 8 percent from nominal at any point in the
200,000 cycle life. Measured drift on the rev C units has been under 5 percent
at 150,000, which is comfortable.

**Why is H1 stiffer than H2 and H3?**
H1 carries the outer panel and the whole closed stack hangs off it when the
device is opened one handed. Softer there and the phone flops open in a pocket.

## Inspection at the line

- [x] Torque at 45, 90 and 135 on every hinge, every unit
- [x] Detent break out force at D1 and D2, every unit
- [ ] Sampling plan for the dwell check, still with Dana
- [x] Gauge R and R study on the torque fixture
