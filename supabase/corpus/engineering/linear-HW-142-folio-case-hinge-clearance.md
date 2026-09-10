# HW-142 · Folio case binds at hinge 3 before flat

| | |
| --- | --- |
| Status | In Progress |
| Assignee | Sam Lindqvist |
| Labels | accessories, bellows, mechanical |
| Project | Accessories |
| Initiative | Ship the Fold S1 to carrier certification |
| Created | 2026-09-02 |
| Updated | 2026-09-09 |

## Description

First folio case sample from the vendor, Chalk, fitted to B12. Phone to tablet is fine. Tablet to desk binds at hinge 3 roughly 40 degrees before flat and you can feel it stop rather than resist.

Cause is the spine. The vendor drew it as a mirror of the hinge 1 flexure. Hinge 3 folds the opposite way, so the case material that sits on the outside of the hinge 1 bend sits on the inside of the hinge 3 bend, and there is nowhere for it to go.

Second problem found while measuring the first. Case adds 3.9 mm at the hinge 1 end against a 3.0 mm limit, because the case was drawn to a parallel folded block and our folded block is a wedge, 15.8 mm at the hinge 1 end and 14.1 mm at panel 4. The vendor padded uniformly to the thick end.

Needs a spine redraw as three separate flexures with their own neutral axes, and a case section that follows ENV-4 rather than a constant thickness.

## Activity

**Sam Lindqvist** commented · 2026-09-02
> Numbers from the bench. Closing torque at hinge 3 with the case fitted goes from 38 mNm to 61 mNm through the last 40 degrees, then the case stops it. Spec on FC-4 is 8 percent. This is 60 percent and then a hard stop, so it fails twice.

**Ben Achilov** commented · 2026-09-03
> Related and worse. Ori reads the desk state off the hinge angle sensors. If the case stops the device 40 degrees short, the shell sits in the tablet state with what the user sees as a fully open device. It does not look like a case problem to a person holding it. It looks like the software failing to notice.

**Sam Lindqvist** commented · 2026-09-03
> That is a good reason to make this a blocker rather than an accessory annoyance.

**Ben Achilov** commented · 2026-09-03
> I am not going to loosen the desk state threshold to accommodate a case. If I do that, every genuinely half open device starts claiming to be a desk.

**Sam Lindqvist** commented · 2026-09-04
> Nobody is asking you to. Fix belongs in the case.

**Sam Lindqvist** commented · 2026-09-05
> Vendor call. They accepted both findings and did not argue about the wedge, which suggests we are not the first customer to hand them a folded envelope that is not parallel. Revised spine is three flexures, each with its own neutral axis, and the case section tapers to match ENV-4. Sample two in about two weeks.

**Jane Okonkwo** commented · 2026-09-07
> What happens to the four finishes if sample two is also wrong.

**Sam Lindqvist** commented · 2026-09-07
> All four come off the same tool geometry with different coverings, so a fit fix is one fix and not four. The risk is not that we ship three finishes instead of four. The risk is that we ship none of them, because the case either folds or it does not.

**Sam Lindqvist** commented · 2026-09-09
> Added FC-7 to the sample two request explicitly. The current sample rubs the outer layer along the panel 1 edge every time it closes. On the glass we reversed away from that would have been nothing. On Meniscus-C it is a haze line in six weeks and it will be blamed on the phone rather than on the case. Witness panel test goes on sample two with a controlled dust load.
