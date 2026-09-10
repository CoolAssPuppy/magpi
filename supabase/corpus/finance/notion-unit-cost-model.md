# Fold S1 unit cost model

| | |
| --- | --- |
| Owner | John Mbeki |
| Status | Approved |
| Revision | 7 |
| Basis | Pilot line volumes, first 50,000 units |
| Last edited | 2026-09-05 |
| Tags | cost, pricing, finance, model |

## Where it landed

> **Unit cost is $1,140 at pilot volume.** That number set the launch price of
> $1,899, which holds roughly 40 percent gross margin before channel. Revision 7
> is the one Jane signed on 4 September and the one the board pack quotes.

This page is the signed summary. Every line item with its quote reference lives
in the cost model workbook in the Drive folder. The two agree, and if they ever
stop agreeing the workbook is right and this page is stale.

## Bill of materials

| Line | Cost per unit | Notes |
| --- | --- | --- |
| Display stack, four panels | $440 | The largest line by a distance and the one with the most room at volume |
| Hinge assembly, three hinges | $156 | Dana's final number, inside the range she would not give me on the 17th |
| SoC and memory | $168 | Fixed by contract |
| Outer layer, Meniscus-C polymer with hard coat | $56 | Was $63 with UTG-3 glass |
| Lamination scrap allowance | $19 | 4 percent on the lamination step, unproven bond on four panels |
| Camera modules | $76 | Four modules |
| Shell and frame | $62 | |
| Battery cell and charging | $48 | |
| Antenna and RF | $21 | |
| Assembly labour, pilot line rate | $58 | Roughly 2.6 times the volume rate, hinge alignment is manual |
| Test time | $15 | |
| Warranty reserve | $11 | Thin, see the open items |
| Freight, September rate | $10 | |
| **Total** | **$1,140** | |

Tooling amortisation is not in this number. It is tracked separately and one
lamination fixture over 100,000 units adds $2.14 per unit.

## The walk from the April placeholder

| Version | Number | What moved |
| --- | --- | --- |
| April placeholder | $1,050 | Carried into every pricing conversation this year |
| First real pass, 19 August | $1,072 | Real quotes on panels and hinges |
| Corrected, 21 August | $1,118 | Assembly labour at the pilot rate instead of the volume rate |
| Closed, 2 September | $1,140 | Polymer outer layer, lamination scrap allowance, September freight |

We spent the year quoting ourselves a number that was $90 light. That is the
whole story of this program in one line.

## Price

| | |
| --- | --- |
| Launch price | $1,899 |
| Unit cost | $1,140 |
| Gross margin per unit | $759 |
| Gross margin percent | 40.0 percent |
| At $1,799 | 36.6 percent |

Below $1,799 the carrier structures stop making sense on our side. Above $1,999
we are asking a first generation product to win on price perception against
established flagships, which is a bad way to spend the one launch we get. Jane
called $1,899 on 4 September and said she was not going to move.

## The August material change

The outer layer moved from UTG-3 glass to Meniscus-C polymer on 27 August, four
days before the tooling commit.

| Effect | Amount |
| --- | --- |
| Outer layer material, per unit | Down $7 |
| Lamination scrap allowance, per unit | Up $19 until the pilot build gives a real yield |
| Vendor engineering time on the abandoned glass work | $18,000, charged |
| Cosmetic spec re-measurement | $19,000 |
| Lamination fixture, polymer against glass | $53,000 cheaper |
| Net effect on capex | About $35,000 positive |

The reversal landed before the tooling commit, which is the only reason the
fixture line reads the way it does. I flagged the commit deadline on the
Wednesday and the decision moved to the Thursday. That is worth remembering the
next time somebody asks why finance wants to hear about a decision early.

**Does the polymer save money then?**
Seven dollars a unit on material and about $35,000 on capex, against a $19
scrap allowance that exists because nobody has run this bond on four panels
before. Today it is a wash. Nobody chose this material for the cost and the cost
is not why it is the right call.

**What is the biggest risk in this model?**
The $19 scrap allowance. Dana's caveat is that $1,140 assumes the lamination
step yields the way the vendor says it does. Twenty dollars of movement is
tolerable. More than twenty and the price conversation reopens.

**And after that?**
The hinge assembly at $156 with a single supplier. A supplier problem there
stops the line.

**What moves the number most at volume?**
The display stack. Every ten percent off that line is $44 a unit.

## Open

- [x] Revision 7 signed by Jane
- [x] Assembly labour corrected to the pilot rate
- [ ] Second source quote for the hinge assembly
- [ ] Volume tier quote for the polymer, Dana is asking
- [ ] Warranty reserve is a placeholder at $11 and needs a real model
- [ ] Revisit the scrap allowance after the first article build
