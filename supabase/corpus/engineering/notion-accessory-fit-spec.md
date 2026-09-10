# Accessory fit spec

| | |
| --- | --- |
| Owner | Sam Lindqvist |
| Status | Draft |
| Last edited | 2026-09-03 |
| Tags | accessories, mechanical, spec |

## Scope

Three things attach to or enclose the device and none of them existed as a
mechanical problem until we had four panels and three hinges.

1. The folio case, in Ink, Chalk, Moss and Ember.
2. The desk stand, Chalk only.
3. The packaging tray, which is not an accessory but shares every tolerance
   argument with one.

This page is the fit envelope all three work against. It is not the industrial
design and it does not decide what anything looks like.

## The folded envelope

Everything below refers to the same drawing, ENV-4, issued 26 August.

| Dimension | Value | Note |
| --- | --- | --- |
| Folded length | 168.0 mm | Panel 1 outer face to panel 4 outer face |
| Folded width | 74.4 mm | |
| Folded thickness, hinge 1 end | 15.8 mm | Thickest point |
| Folded thickness, panel 4 end | 14.1 mm | |
| Wedge angle | 0.6 degrees | Hinge 1 end to panel 4 end |
| Tablet state length | 331 mm | Two panels open |
| Desk state length | 656 mm | All four |
| Mass, device only | 289 g | |

The wedge is the number people forget. A folded Fold S1 is not a slab. Three
hinge barrels stack at one end and nothing stacks at the other. Every enclosure
we have had made so far was drawn as though the folded block were parallel, and
every one of them was wrong in the same direction.

## Folio case

### Requirements

| ID | Requirement | Verification |
| --- | --- | --- |
| FC-1 | Case folds with the device through phone, tablet and desk without binding on any hinge | Manual, 500 cycles, all three states |
| FC-2 | No case material enters the hinge sweep of H1, H2 or H3 at any angle from 0 to 180 degrees | Section view against ENV-4, plus physical |
| FC-3 | Added thickness at the hinge 1 end no more than 3.0 mm | Measured |
| FC-4 | Case does not change the hinge closing torque by more than 8 percent | Torque rig, all three hinges |
| FC-5 | Device retained at 1.5 g in any orientation with the case open | Shake table |
| FC-6 | Device removable by hand without a tool | Ten people, no instructions |
| FC-7 | Case does not contact the Meniscus outer layer at any point | Inspection, and a scratch witness panel over 500 cycles |
| FC-8 | Cutouts clear every port, mic, speaker and the camera stack in all states | Drawing, then physical |
| FC-9 | Case adds no more than 84 g | Scale |
| FC-10 | Fit envelope identical across all four finishes | Sample from each finish tool |

### The hard one is FC-2

Three hinges means three sweeps, and they are not the same sweep. Hinge 1 is
the outer hinge and folds one way. Hinge 2 is the middle one and takes the most
travel. Hinge 3 folds the opposite way from hinge 1, which is what lets the
thing stack rather than roll into a scroll.

A case spine that works across hinge 1 will foul hinge 3 if it is drawn as a
mirror, because the material has to be on the outside of one bend and the
inside of the other. The first sample from the case vendor did exactly this and
it bound at hinge 3 about 40 degrees before flat.

There is no clever fix. The spine is three separate flexures with different
neutral axes and the case is thicker at the hinge 1 end to match the wedge.

### FC-7 is the one that will bite us later

Meniscus-C is polymer. It creases less than the glass we reversed away from and
it scratches more, and we knew that when we chose it. A case that rubs the
outer layer anywhere, even lightly, even through fabric, is a case that puts a
haze on the part of the device the customer looks at with the phone shut.

The witness panel test exists because a scratch from a case does not show up in
500 cycles on a clean bench. It shows up in six weeks in a bag with grit in it.
We cannot run six weeks, so we run 500 cycles with a controlled dust load and
inspect under a point source.

## Desk stand

### Requirements

| ID | Requirement | Verification |
| --- | --- | --- |
| DS-1 | Holds the device in the desk state, all four panels, at 12 degrees from horizontal | Measured |
| DS-2 | Ori detects the stand and switches to desk state within 400 ms of seating | ORI-44 |
| DS-3 | Detection does not false trigger from any other magnet in normal use | ORI-44 |
| DS-4 | Stand does not tip with the device seated and a 2 N horizontal push at panel 4 | Bench |
| DS-5 | Device lifts out one handed | Ten people |
| DS-6 | Stand does not block the ventilation path along the panel 2 and 3 rear faces | Thermal, see below |
| DS-7 | Stand contacts only the frame, never a panel rear face | Inspection |
| DS-8 | Chalk finish matches the device Chalk within the agreed colour tolerance | Spectro |

### DS-6 and the thermal problem

The desk state is the state that runs hottest. All four panels lit, the SoC
working, and the thermal work in the four panel case is already at the skin
limit rather than comfortably under it.

A stand that lies flat against the rear of panels 2 and 3 takes away the
surface we were relying on to shed that heat. The first stand concept did
exactly that, because it was drawn as a cradle.

The current concept contacts the frame at four points and leaves the rear faces
open. That is DS-7 and it is why the stand looks sparser than the industrial
design wanted. It is not a style decision.

There is a second order effect nobody has measured yet. A stand holds the
device at a fixed angle for hours, which is a longer sustained load than any of
our thermal runs use. Somebody should run the desk state on the stand for two
hours and see where it settles. Not this week.

## Packaging tray

The tray is Marketing's product and our tolerance problem.

Moulded fibre holds plus or minus 0.5 mm on a feature at this scale. The first
tray was drawn to a 0.4 mm nominal clearance against ENV-4, which means the
tolerance band crosses zero and about half of them were an interference fit at
the hinge 1 end.

Recommended and now adopted:

| Feature | First tray | Current tray |
| --- | --- | --- |
| Clearance, hinge 1 end | 0.4 mm | 1.2 mm |
| Clearance, panel 4 end | 0.4 mm | 0.6 mm, with a compliant rib |
| Cavity floor | Flat | Wedge matched to ENV-4 |
| Retention | Friction | Compliant rib on the panel 4 edge only |

The rib takes up the slack so that a loose tray still holds the device during
shipping, and it is on the thin end so it never pushes the hinge stack.

Dana has the moulder and has the current drawing. The drop test with the real
tray rather than a foam stand-in is running and the result is the thing that
decides whether the tray is finished.

## Open

- [x] ENV-4 issued with the wedge called out
- [x] Case spine redrawn as three flexures
- [ ] Witness panel result on FC-7
- [ ] Two hour sustained desk state on the stand
- [ ] Confirm all four case finishes come off tools with the same fit envelope
- [ ] Torque delta measurement with the case fitted, FC-4
