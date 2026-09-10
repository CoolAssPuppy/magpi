# OPS-40 · Fold S1 unit cost roll-up, pilot volume

| | |
| --- | --- |
| Status | Done |
| Assignee | John Mbeki |
| Labels | cost, bom, pricing, decision |
| Project | Cost and pricing |
| Created | 2026-08-13 |
| Updated | 2026-09-05 |

## Description

We have been carrying a placeholder unit cost since April and every pricing conversation has been built on it. Close the bill of materials at pilot volume, add the things people forget, and produce one number.

In scope: the four panels, the Bellows assembly, the SoC and memory, cell, camera module, shell and frame, the outer layer, assembly labour at the pilot line rate, test time, warranty reserve and freight. Tooling amortisation is separate and tracked in OPS-43.

## Activity

**John Mbeki** changed status from Todo to In Progress · 2026-08-14

**John Mbeki** commented · 2026-08-19
> First pass at $1,072. Panels are 41% of it, which surprises nobody, and the Bellows assembly is 14%, which surprised me.

**Dana Provenzano** commented · 2026-08-20
> Your assembly labour number is the volume rate. The pilot line runs at roughly 2.6 times that per unit because the hinge alignment step is manual and the two piece hinge cover added another manual step this week. Use the pilot rate for anything we build this year.

**John Mbeki** commented · 2026-08-21
> Corrected. That moves it to $1,118.

**Dana Provenzano** commented · 2026-08-28
> Outer layer material changed on 27 August. Polymer stack instead of the glass, different vendor, and the price is different both ways: the material is cheaper per unit and the lamination yield is unproven so I would carry a scrap allowance until the pilot build tells us the truth.

**John Mbeki** commented · 2026-09-02
> With the polymer at quoted price, a 4% scrap allowance on the lamination step, and freight at the September rate, the number is $1,140.

**Jane Okonkwo** commented · 2026-09-03
> What does $1,140 mean for where we price it.

**John Mbeki** commented · 2026-09-03
> At $1,899 we hold roughly 40% gross margin before channel, which leaves enough for carrier subsidy structures and a promotional period without the whole thing going underwater. Below $1,799 the carrier deals stop making sense on our side. Above $1,999 we are asking a first generation product to beat established flagships on price perception, which is a bad way to spend our one launch.

**Jane Okonkwo** commented · 2026-09-04
> $1,899. Build everything else on that.

**John Mbeki** commented · 2026-09-05
> **Unit cost $1,140 at pilot volume. Launch price $1,899.** Both numbers stay inside this space until Jane says otherwise. The cost model is in the Drive folder with the line items.

**John Mbeki** changed status from In Progress to Done · 2026-09-05
