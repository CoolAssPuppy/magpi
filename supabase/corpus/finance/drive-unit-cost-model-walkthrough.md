# Unit cost model, walkthrough of the $1,140

John Mbeki
2026-09-05
Basis: pilot volume, first 100,000 units
Related: OPS-40, OPS-43

## What this document is

OPS-40 closed with one number and no explanation of how it got there. This is
the explanation. Anybody in Finance should be able to read this and rebuild the
model from scratch, and anybody who wants to argue with the number should argue
with a line in it rather than with the total.

Unit cost at pilot volume is $1,140. That figure is a landed, fully burdened
cost per finished device. It excludes tooling amortisation, which sits in
OPS-43, and it excludes everything that happens after the device leaves the
factory other than freight and the warranty reserve.

## How the number moved

We carried a placeholder from April until August and every pricing conversation
in that period was built on a guess. The three real numbers are:

| Date | Number | What changed |
| --- | --- | --- |
| 2026-08-19 | $1,072 | First closed bill of materials at pilot volume |
| 2026-08-21 | $1,118 | Assembly labour corrected to the pilot line rate |
| 2026-09-02 | $1,140 | Polymer outer layer, scrap allowance, September freight |

The $46 step is the one worth understanding. My first pass used the volume
assembly rate. Dana pointed out that the pilot line runs at roughly 2.6 times
that per unit, because the hinge alignment step is manual and the two piece
hinge cover added another manual step. Anything we build this year is built at
the pilot rate. That correction was the single largest error in the model and
it came from someone outside Finance reading it carefully.

The $22 step from the material change nets three movements: the polymer costs
$19 less than the glass, a 4 percent scrap allowance on the lamination step
adds $8 because the polymer lamination yield is unproven, and freight moved
from $14 to $47.

## The lines

| Line | Cost | Note |
| --- | --- | --- |
| Inner display stack, panels 2 to 4 | $318.00 | Three folding panels, drivers included |
| Outer panel assembly, panel 1 | $86.00 | Display, Meniscus-C film, hard coat and AR |
| Touch layers and flex bonds, four panels | $58.00 | The H2 fold bond is the fragile one |
| **Panels subtotal** | **$462.00** | 40.5 percent of unit cost |
| H1 hinge assembly | $61.00 | Outer hinge, the expensive one |
| H2 and H3 hinge assemblies | $74.00 | Two hinges |
| Hinge covers, two piece | $12.00 | Added a manual assembly step |
| Graphite bridge through H2 | $11.00 | Thermal, lives in the hinge stack |
| **Bellows subtotal** | **$158.00** | 13.9 percent of unit cost |
| SoC and memory | $178.00 | |
| Cell pack, two cells | $47.00 | |
| Camera modules | $53.00 | Three cameras |
| Chassis, magnesium frame and panel backs | $68.00 | |
| Main board, PMIC, RF front end, antennas | $44.00 | |
| Vapour chambers, two | $14.00 | One per half |
| Speakers, haptics, microphones, sensors | $13.00 | |
| Assembly labour, pilot line rate | $31.00 | 2.6 times the volume rate |
| Test and calibration time | $9.00 | Per-panel touch calibration is most of it |
| Scrap allowance, lamination, 4 percent | $8.00 | Comes out when the pilot build gives a real yield |
| Warranty reserve | $8.00 | 2 percent return rate assumed |
| Freight, September air rate | $47.00 | See below |
| **Total** | **$1,140.00** | |

## The four lines I would challenge if I were reading this

**Freight at $47.** This is air. The earlier model had $14, which was sea
freight at volume. The pilot and the first production builds move by air
because the schedule cannot absorb five weeks on the water. If the schedule
ever gets four weeks of slack in it, this line drops by roughly $33 and takes
the unit cost with it. It is the single most reversible number in the model.

**Assembly labour at $31.** True at the pilot line and wrong at volume. At the
volume rate this line is about $12. I have deliberately not modelled the volume
case as the headline number, because we would spend the difference before we
earned it.

**The scrap allowance at $8.** A guess dressed as a line item. Four percent is
what Dana and I agreed to carry until the pilot build gives a real lamination
yield. At 95 percent yield this line is about $5 and at 80 percent it is closer
to $22, which is why the pilot build matters more to this model than anything
else on the schedule.

**The display stack at $318.** Four hundred and sixty-two dollars of this
device is the thing a person will call the screen, and the three folding panels
are $318 of that on their own. This does not move. Every conversation about
taking cost out of the Fold S1 that avoids this line is a conversation about
rounding.

## What is not in here

Tooling amortisation. OPS-43 has it. One lamination fixture over 100,000 units
adds $2.14 per unit and a second fixture, which we will want if we go to two
shifts, adds the same again. That decision waits for a real yield number.

Non-recurring engineering, certification fees and the test house. Those are
period costs and they do not belong in a unit cost.

Channel costs of any kind. This number is what it costs us to have a finished
device in a box, and nothing about what happens to it afterwards.

## How stale this gets

Fast. The material change moved it by $22 in a week. My rule is that this
document is rebuilt the day any of the following changes: a supplier quote, the
assembly step count, the freight mode, or the scrap allowance. If you are
reading this more than a month after the date at the top, ask me for the
current one before you quote it at anyone.
