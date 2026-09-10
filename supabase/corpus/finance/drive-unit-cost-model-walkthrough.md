# Unit cost model workbook, walkthrough of the $1,140

John Mbeki
2026-09-05
Basis: pilot line volumes, first 50,000 units
Workbook: fold-s1-cost-model-v11.xlsx
Related: OPS-40, OPS-43, and the signed summary page in Notion

## What this is

The Notion page carries the thirteen line summary that Jane signed and that the
board pack quotes. This document is the workbook behind it, which is where the
quote references and the sub-lines live. The two agree. If they ever stop
agreeing, the workbook is right and the summary page is stale.

Unit cost is $1,140 at pilot volume. It is a landed cost per finished device.
Tooling amortisation is excluded and tracked in OPS-43. Nothing about channel,
returns handling or anything else downstream of the box is in here.

## How the number moved

| Version | Date | Number | What moved |
| --- | --- | --- | --- |
| April placeholder | 2026-04 | $1,050 | Carried into every pricing conversation this year |
| v7 | 2026-08-19 | $1,072 | First closed bill of materials, real quotes on panels and hinges |
| v8 | 2026-08-21 | $1,118 | Assembly labour corrected to the pilot line rate |
| v9 | 2026-08-28 | $1,118 | Placeholder rows opened for the material change |
| v10 | 2026-09-02 | $1,140 | Polymer, lamination scrap allowance, September freight |
| v11 | 2026-09-05 | $1,140 | Quote references and part numbers added, no cost change |

Two steps are worth understanding.

**The $46 step on 21 August.** My first pass used the volume assembly rate.
Dana pointed out that the pilot line runs at roughly 2.6 times that per unit,
because hinge alignment is manual and the two piece hinge cover added another
manual step. Anything we build this year is built at the pilot rate. That was
the largest single error in the model and it was found by somebody outside
Finance reading it carefully.

**The $22 step on 2 September.** Three movements. The polymer outer layer costs
$7 less than the glass did. The lamination scrap allowance adds $19, because
nobody has run this bond on four panels. Freight adds $10, and freight had not
been in the model at all before September, which is a gap I should have closed
in June.

## The lines, with the sub-detail

Category totals are the thirteen lines on the summary page. Sub-lines are how
the workbook builds them.

| Ref | Line | Qty | Unit $ | Extended $ |
| --- | --- | --- | --- | --- |
| 1 | **Display stack, four panels** | | | **440.00** |
| 1.1 | Inner folding display module | 3 | 108.00 | 324.00 |
| 1.2 | Outer display module, panel 1 | 1 | 62.00 | 62.00 |
| 1.3 | Touch layer | 4 | 9.50 | 38.00 |
| 1.4 | Display driver | 2 | 8.00 | 16.00 |
| 2 | **Hinge assembly, three hinges** | | | **156.00** |
| 2.1 | H1 hinge assembly, outer | 1 | 59.00 | 59.00 |
| 2.2 | H2 hinge assembly, centre | 1 | 36.00 | 36.00 |
| 2.3 | H3 hinge assembly, inner | 1 | 36.00 | 36.00 |
| 2.4 | Hinge cover, two piece | 2 | 6.00 | 12.00 |
| 2.5 | Graphite bridge through H2 | 1 | 13.00 | 13.00 |
| 3 | **SoC and memory** | | | **168.00** |
| 3.1 | SoC | 1 | 104.00 | 104.00 |
| 3.2 | LPDDR | 1 | 24.00 | 24.00 |
| 3.3 | UFS storage | 1 | 13.00 | 13.00 |
| 3.4 | Main board, PMIC and passives | 1 | 27.00 | 27.00 |
| 4 | **Outer layer, Meniscus-C with hard coat** | | | **56.00** |
| 4.1 | MC-62A film, converted, hard coat and AF | 1 | 44.00 | 44.00 |
| 4.2 | AR stack processing, Suwon line | 1 | 12.00 | 12.00 |
| 5 | **Lamination scrap allowance** | | | **19.00** |
| 6 | **Camera modules** | | | **76.00** |
| 6.1 | Main camera | 1 | 34.00 | 34.00 |
| 6.2 | Ultra wide | 1 | 18.00 | 18.00 |
| 6.3 | Telephoto | 1 | 16.00 | 16.00 |
| 6.4 | Inner camera | 1 | 8.00 | 8.00 |
| 7 | **Shell and frame** | | | **62.00** |
| 7.1 | Magnesium frame | 1 | 24.00 | 24.00 |
| 7.2 | Panel back covers | 4 | 3.50 | 14.00 |
| 7.3 | Vapour chambers | 2 | 6.00 | 12.00 |
| 7.4 | Speakers, haptics, microphones, sensors | 1 | 8.00 | 8.00 |
| 7.5 | Fasteners, seals, adhesives | 1 | 4.00 | 4.00 |
| 8 | **Battery cell and charging** | | | **48.00** |
| 8.1 | Cell pack, two cells | 1 | 38.00 | 38.00 |
| 8.2 | Charge circuit and connector | 1 | 10.00 | 10.00 |
| 9 | **Antenna and RF** | | | **21.00** |
| 9.1 | RF front end | 1 | 14.00 | 14.00 |
| 9.2 | Antenna assemblies, panels 1 and 4 | 2 | 3.50 | 7.00 |
| 10 | **Assembly labour, pilot line rate** | | | **58.00** |
| 11 | **Test time** | | | **15.00** |
| 12 | **Warranty reserve** | | | **11.00** |
| 13 | **Freight, September rate** | | | **10.00** |
| | **Unit cost, pilot volume** | | | **1,140.00** |

Two labelling notes, because both have caught people out. Line 3 is called SoC
and memory on the summary page and it carries the main board and the passives
as well, which is a name left over from the first model. Line 7 is called shell
and frame and it carries the vapour chambers and the small acoustic parts. I
will rename both in revision 8 and until then the workbook is where the truth
is.

## The four lines I would challenge if I were reading this

**The display stack at $440.** Thirty-nine percent of the device is the thing a
person will call the screen. It does not move at this volume. Every ten percent
we ever take off this line is $44 a unit, and any conversation about cost that
avoids it is a conversation about rounding.

**The scrap allowance at $19.** A guess dressed as a line item. Four percent on
the lamination step is what Dana and I agreed to carry until the pilot build
gives a real yield. Twenty dollars of movement in this line is tolerable. More
than twenty and the price conversation reopens, which is the sentence I would
like people to remember from this document.

**Assembly labour at $58.** True at the pilot line and wrong at volume, where
it is about $22. I have deliberately kept the pilot rate as the headline,
because a company that models the volume rate spends the difference before it
earns it.

**The warranty reserve at $11.** Thin, and I know it is thin. It assumes a
2 percent return rate on a folding device with a first generation hinge. There
is no model behind that number and there should be. It is on the open list.

## What is not in here

Tooling amortisation, which OPS-43 carries. Non-recurring engineering,
certification fees and the test house booking, which are period costs. Any
channel cost at all. This number is what a finished device in a box costs us.

## How stale this gets

Fast. The material change moved it $22 in a week. The workbook is rebuilt the
day a supplier quote, the assembly step count, the freight basis or the scrap
allowance changes. If you are reading this a month after the date at the top,
ask me for the current version before you quote it at anyone, and particularly
before you quote it at a vendor.
