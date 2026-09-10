# ENG-212 · Meniscus outer layer: pick a supplier

| | |
| --- | --- |
| Status | Done |
| Assignee | Sam Lindqvist |
| Labels | display, meniscus, supplier, decision |
| Project | Meniscus outer layer |
| Initiative | Ship the Fold S1 to carrier certification |
| Created | 2026-08-11 |
| Updated | 2026-08-27 |

## Description

Tooling for the outer layer gets committed at the end of August. After that a material change costs us six weeks and a new mask set. We pick one material and one supplier in this issue and we stop reopening it.

Two candidates on the bench:

- **UTG-3**, ultra thin glass, 30 micron, Kyoto vendor. Best pencil hardness of anything we have measured, 7H with the hard coat. Its published bend envelope wants 4.0mm and industrial design has given us 3.2mm, so the vendor cycle claim is what we would be trusting instead of the datasheet.
- **Meniscus-C**, polymer stack, 62 micron, Suwon vendor. Softer, 4H with the hard coat. Runs inside our radius without an argument, and it recovers from a 72 hour hold-closed test that leaves a visible line in the glass.

The decision needs real hinge cycle numbers, not extrapolated ones. HW-88 has four units on the rig going to 200k.

Acceptance: one supplier named in this issue, a signed sample lot, and a material the Bellows team can finish the hinge 2 cam profile against.

## Activity

**Sam Lindqvist** changed status from Todo to In Progress · 2026-08-12

**Sam Lindqvist** commented · 2026-08-12
> UTG-3 sample came back clean at 120k cycles. No haze change, no delamination at the edge seal. Hardness is a real advantage and the Kyoto vendor can hold 30 micron across the full pane width, which Suwon still cannot guarantee for pane 1.
>
> Calling it: UTG-3. I will send the sample lot request today so we have material for the September builds.

**Sam Lindqvist** changed status from In Progress to Done · 2026-08-12

**Ben Achilov** commented · 2026-08-13
> Does anything about panel geometry or refresh change with the glass? Ori reads the outer panel through the same state machine as the inner three and I would rather find out now than in October.

**Sam Lindqvist** commented · 2026-08-13
> Nothing changes. Same panel, same resolution, same refresh. Only the top layer is different.

**Jane Okonkwo** commented · 2026-08-14
> Fine. Log it in Notion as a decision record so we are not relitigating this in October.

**Sam Lindqvist** changed status from Done to In Progress · 2026-08-24

**Sam Lindqvist** commented · 2026-08-24
> Reopening. Unit B7 on the HW-88 rig is showing a line across pane 2 at 150k cycles. It is faint under diffuse light and obvious under a point source. Two other units are clean so far. Continuing the run.

**Ben Achilov** commented · 2026-08-25
> Faint under diffuse light is how every crease starts. What is the failure mode, the glass or the adhesive under it?

**Sam Lindqvist** commented · 2026-08-26
> Neither yet. It looks like microfracture in the hardcoat, which is the layer we cannot repair. Teardown is HW-91.

**Sam Lindqvist** commented · 2026-08-27
> B7 failed at 180,000 cycles. Fracture propagated across the full fold line on pane 2. The other three units are at 180k with one showing early haze at the same location, so this is not a single bad sample.
>
> We spec 200k cycles for a two year life. We do not have it with UTG-3 at a 3.2mm radius.

**Jane Okonkwo** commented · 2026-08-27
> B7 failed at 180k. We are not shipping a phone with a visible crease.

**Ben Achilov** commented · 2026-08-27
> What does Meniscus-C do on the same rig?

**Sam Lindqvist** commented · 2026-08-27
> Suwon ran their own 200k on the 2.4mm radius and sent the data last month. I did not trust it enough to design to it. I trust it more now. We can put two Meniscus-C units on our rig this week and have 200k by 4 September.
>
> Cost of the change: new lamination profile, the edge seal moves in 0.4mm, and the anti-fingerprint coating is a different chemistry so the whole cosmetic spec gets re-measured. Six days of my time. The AR stack goes on polymer instead of glass and Suwon runs both lines, so that part is a purchase order and not a science project.

**John Mbeki** commented · 2026-08-27
> Tooling commit is Monday. If the material changes it has to change before Friday close or we pay for a mask set we throw away.

**Sam Lindqvist** commented · 2026-08-27
> Then it changes today.
>
> **Decision: Meniscus outer layer is Meniscus-C polymer from the Suwon vendor.** This supersedes the 12 August choice of UTG-3. Trigger was unit B7 failing the hinge cycle test at 180,000 cycles against a 200,000 cycle spec. Bend radius stays where it is, because opening it up far enough for UTG-3 puts the closed device over 15mm and retools the shell. Hardness drops from 7H to 4H, which we accept and argue about again when we decide what goes in the retail box.
>
> Follow-ups: ENG-218 for optical haze at the new radius, ENG-221 to re-run pencil hardness, HW-138 for the second source.

**Jane Okonkwo** commented · 2026-08-27
> Agreed. Write it down properly, both decisions, including the one we got wrong. I want the reason findable in six months.

**Sam Lindqvist** changed status from In Progress to Done · 2026-08-27
