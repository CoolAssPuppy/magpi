# Outer layer decision record

| | |
| --- | --- |
| Owner | Sam Lindqvist |
| Status | Decided |
| Decision date | 2026-08-27 |
| Supersedes | Outer layer decision, 2026-08-12 revision |
| Last edited | 2026-09-03 |
| Tags | display, meniscus, decision, hardware |

## Context

Meniscus is the outer display layer, the panel a user touches when the Fold S1
is shut. It is the only surface exposed when the device is closed, so it takes
pocket abrasion, keys, thumbnails and every open and close cycle of the outer
hinge. The material choice for Meniscus was the last open item blocking the
pilot line tooling order.

We picked UTG-3 ultra thin glass on 12 August. We reversed that on 27 August.
Both decisions are recorded here so nobody has to reconstruct why the glass went
away.

> **Decision.** Meniscus ships in Meniscus-C polymer. UTG-3 is out. Reversed
> 2026-08-27 after unit B7 failed hinge cycle test at 180,000 cycles with a
> visible crease along the outer fold axis.

## What happened

Unit B7 was the third UTG-3 build to go on the cycle rig. It ran clean through
the first two checkpoints. At 150,000 cycles a faint line appeared across the
panel 2 fold, invisible in diffuse light and obvious under a point source. By
180,000 it had propagated across the full fold line and was visible under normal
office light at any viewing angle past about 30 degrees. Teardown found
microfracture in the hard coat, which is the layer we cannot repair.

The full teardown is in the B7 cycle failure analysis page. The short version is
that our bend radius of 3.2 mm is tighter than the 4.0 mm UTG-3 datasheet
envelope and the vendor never claimed otherwise. We read the datasheet
optimistically in August.

## Options we looked at

| Option | Cycles to visible crease | Pencil hardness | Lead time | Verdict |
| --- | --- | --- | --- | --- |
| UTG-3 ultra thin glass, 30 micron, Kyoto vendor | 180,000 (B7) | 7H | 9 weeks | Rejected 27 Aug |
| UTG-3 with revised bend radius | Not tested | 7H | 9 weeks plus retool | Rejected, industrial design will not give up the radius |
| Meniscus-C polymer, 62 micron, Suwon vendor | 200,000 on the vendor rig, no visible crease | 4H with hard coat | 6 weeks | Selected 27 Aug |
| Meniscus-B polymer, previous generation | 210,000 | 3H | 6 weeks | Rejected, scratch complaints in the A sample review |

## What we gave up

Meniscus-C is softer than glass. Pencil hardness lands at 4H with the hard coat
applied, against 7H for UTG-3. In practice that means a key in the same pocket
will mark the outer panel eventually. We tested this with a coin drag rig and
the mark is shallow and does not catch a fingernail, but it is there.

We decided a scratch a user has to hunt for beats a crease every user sees.

**Why did we not just relax the bend radius?**
Industrial design has the folded thickness at 14.1 mm and every millimetre of
bend radius adds roughly 0.4 mm to that. Opening the radius from 3.2 mm to the
4.0 mm the UTG-3 envelope wants puts the closed device over 15 mm, which changes
the whole shell tooling. Jane called that too expensive in schedule terms on 26
August and nobody argued.

**Does this change anything for Ori?**
No. Panel geometry, resolution and refresh are unchanged. Ori sees the same
outer panel it always saw. Ben confirmed on 28 August that the panel state
machine needs no edit.

**What about the anti-reflective stack?**
The AR stack is deposited on the polymer instead of the glass. The vendor runs
both. Optical measurements came back within 2 percent of the UTG-3 samples on
reflectance and we consider that noise.

## Impact on the schedule

| Area | Effect |
| --- | --- |
| Pilot line tooling | Polymer die is a different fixture. Dana reordered on 28 Aug. |
| Supplier | Suwon vendor instead of Kyoto. Suwon runs the AR line too, so the stack is one purchase order. |
| Cosmetic spec | Anti-fingerprint coating is a different chemistry, so the whole cosmetic spec gets re-measured |
| Cycle test | Restart from zero on the first Meniscus-C unit, B11 |
| Certification | No effect, the outer panel is not in the RF path |
| Industrial design | No effect, thickness and radius unchanged |

## Open questions

- [ ] Second source for Meniscus-C polymer. One vendor is one vendor.
- [x] Confirm tooling change with Dana
- [x] Re-run the coin drag rig on the production hard coat lot
- [ ] Decide whether the retail box carries a screen protector by default
- [x] Tell the industrial design review that the radius is safe

## History

| Date | Change | By |
| --- | --- | --- |
| 2026-08-12 | UTG-3 selected. Rationale was hardness and the vendor cycle claim. | Sam Lindqvist |
| 2026-08-24 | B7 goes on the rig | Sam Lindqvist |
| 2026-08-27 | Reversed to Meniscus-C polymer | Sam Lindqvist |
| 2026-09-03 | Added the AR stack answer after the display review | Sam Lindqvist |
