# Glossary

| | |
| --- | --- |
| Owner | Priya Raghunathan |
| Status | Living document |
| Last edited | 2026-09-08 |
| Tags | glossary, company, reference |

## Why this page exists

Somebody joins, reads a Slack thread about the crease thing on Meniscus and has
no idea whether that is hardware, software or a customer complaint. This page is
the answer to every one of those questions in one place. If a word is used in
more than two channels and is not here, add it.

## Product and parts

| Term | Meaning |
| --- | --- |
| Fold S1 | The product. A four panel folding phone with three hinges. |
| Meniscus | The outer display layer, the part a user touches when the device is shut. It is the only surface exposed when the phone is closed. |
| Meniscus-C | The polymer the outer layer is made of, chosen 27 August. Softer than glass, survives our bend radius. |
| UTG-3 | Ultra thin glass, 30 micron. The outer layer material we picked on 12 August and reversed on 27 August. Findable in old bills of materials. |
| Bellows | The hinge assembly, all three hinges together. Not one hinge. When somebody says the Bellows is stiff they mean the assembly. |
| H1, H2, H3 | The individual hinges. H1 is outer, H3 is inner. H1 folds the opposite way from the other two. |
| Ori | The shell and window manager. The software that decides what shows on how many panels. |
| Panel | One of the four display sections. Numbered 1 to 4 from the outer side. Some people write pane. Same thing. |
| Hard coat | The scratch layer on top of the outer display material. |
| AR stack | Anti reflective coating layers on the outer panel. |

## Ori states

| Term | Meaning |
| --- | --- |
| COVER | Device shut. One panel active. |
| PHONE | H1 open. Two panels, ordinary phone use. |
| BOOK | H1 and H2 open. Three panels. |
| DESK | All three hinges open. Four panels, the full surface. |
| LAPTOP | H1 at the 90 degree detent, keyboard on the lower half. |
| TENT | Device propped, inverted, two panels. |
| Settle timer | The delay before Ori commits to a new state, so a device passing through an angle does not flash a layout. |

## Hardware test words

| Term | Meaning |
| --- | --- |
| Cycle | One open and close of a hinge. Life is counted in cycles. |
| The rig | A cycle bench. Three of them, plus the environmental chamber. |
| Detent | A position the hinge wants to hold. There are two, at 90 and 180 degrees. |
| Torque | How hard the hinge resists being moved. Measured at four angles per hinge. |
| Crease | A visible permanent line along a fold. The thing we are trying not to have. |
| Raking light | A light held at a shallow angle. It finds cosmetic defects that diffuse light hides. |
| Coin drag | A scratch test. A weighted coin dragged across the outer panel. |
| B7, B11, B12 | Build unit numbers. B7 is the unit that failed the cycle test in August. |
| Pilot line | The small production line in Shenzhen that builds the first real units. |

## Where work lives

| Term | Meaning |
| --- | --- |
| ENG, HW, ORI, OPS, GTM | Linear issue prefixes. ENG is systems and certification, HW is mechanical, ORI is shell software, OPS is supply chain and manufacturing, GTM is marketing. |
| Decision record | A Notion page with an options table and a Decision callout. The place a decision lives. |
| Supersedes | A line on a decision record pointing at the decision it replaced. The old one stays. |
| The crease thing | What people call the outer layer decision in Slack. Same subject as the outer layer decision record and the same subject as the Linear issue about the Meniscus supplier. |

**Who maintains this?**
Priya, but anybody can add a row. Adding a row you are not sure about is better
than leaving a word undefined.

**Something here is out of date.**
Fix it. This page is worse than useless when it is stale, because people trust
a glossary.
