# Thermal analysis before the test house, all six fold states

Ben Achilov
2026-09-07
Builds: ori-0.9.4 with firmware 0.7.8, units B11 and B13
Related: ENG-230, ENG-233, ENG-241, and the thermal and RF test plan

## What this is

The test house has us from 14 September. This is everything we know about
thermal on the Fold S1 in one document, so that the three of us who have been
arguing about it in Linear stop having the argument in six places.

The shape of the problem. Shut, the device is a four layer stack with no
airflow between the panels and a small area to shed heat from. Open flat in
DESK, it is one thin surface with four times the area and four panels lit. The
same workload produces very different skin temperatures, and the fold state
changes which part of the device is hot.

Two limits. Skin temperature at any accessible point stays under 43 C, which is
the number we agreed for a surface a person holds. Package temperature stays
under the governor's throttle entry, which is where the SoC starts dropping the
big cores.

## Where the heat actually is

The SoC is behind panel 1. For the first month I assumed the hot spot would be
there and it is not. In every four panel case the skin hot spot is on the back
of panel 3, and it comes from the display driver running panels 3 and 4 at full
backlight rather than from the SoC at all.

That took me two days and one thermal camera to believe.

The second thing worth knowing is that heat does not cross a hinge easily. The
vapour chamber cannot cross one at all. ENG-233 settled this: a flexible vapour
chamber sample lost fluid at 24,000 cycles on the rig, which rules it out for a
device that folds 200,000 times. What we ship is two chambers, one per half,
bridged by 60 micron folded graphite routed beside the display flex through H2.
That moves 0.9 W into the cold half, against the 1.4 W the model promised,
because the fold in the graphite is a thermal resistance the model ignored. It
adds 0.11 mm to the hinge stack, which was in budget.

## Results

Ambient 25 C unless stated. Ten minute runs except where the case is defined as
sustained.

| Fold state | Workload | Ambient | Peak skin, C | Location | Package, C | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| COVER | 30 W charge | 25 | 41.2 | outer panel centre | 68 | Pass |
| COVER | 30 W charge | 35 | 44.1 | outer panel centre | 71 | Fail, fixed in 0.7.8 |
| COVER | Video call, camera and radio | 25 | 42.8 | outer panel upper | 74 | Marginal |
| PHONE | Sustained browse | 25 | 39.6 | panel 2 rear | 70 | Pass |
| BOOK | Three panel layout | 25 | 38.1 | panel 3 rear | 66 | Pass |
| DESK | Full Ori layout, three apps | 25 | 38.9 | panel 3 rear | 69 | Pass |
| DESK | 30 W charge | 25 | 36.4 | panel 1 rear | 64 | Pass |
| DESK | Four panel video, before backlight work | 25 | 43.1 | panel 3 rear | 47 at package sensor, throttled at 4 min | Fail |
| DESK | Four panel video, 0.7.8 | 25 | 41.6 | panel 3 rear | 45 at ten minutes, no throttle | Pass |
| DESK | Four panel video, 0.7.8 | 30 | 42.7 | panel 3 rear | 46 at ten minutes, no throttle | Marginal |

The package numbers in the last three rows are from the package sensor, which
reads lower than the junction. Every other package figure in the table is the
junction estimate. Mixing the two in one table is untidy and I have left it
that way because the four panel video case is the one everybody quotes and I
want the number they quote to be the number I measured.

## The two fixes that got us here

**Per-panel backlight, in 0.7.8.** Ori knows which panel has focus and which
panels have had no content change. It now tells the display driver. A panel
with no content change for 45 seconds ramps from 400 to 320 nits over three
seconds. The first version used 8 seconds and a step change, and it dimmed a
document somebody was reading, which Jane correctly called worse than a warm
phone. At 45 seconds with the slow ramp, nobody in the office noticed it when I
did not tell them it was there, and three of four noticed it when I did.

That is 1.5 C at the skin in the four panel video case and it is the difference
between failing and passing.

**Charge taper, in 0.7.8.** Shut and charging at 35 C ambient reaches 44.1 C,
which is a fail. The firmware now tapers charge power when the device is shut
and the skin sensor passes 40 C. It costs charge speed in a pocket. The room
accepted that trade in about fifteen seconds and I would like it recorded that
nobody argued.

## What is still open

The 30 C ambient row. We pass at 42.7 C with 0.3 C of margin, and a
certification lab is not always 25 C. If the lab room runs warm I would rather
know before we get there than after, so I have asked Dana to confirm the
chamber ambient in writing.

A 30 minute video call in a warm room still throttles to 41 fps on a call that
renders at 30. Nobody sees it. I have decided to be at peace with this and
Sam has agreed to stop bringing it up.

The thermal budget spreadsheet in Drive is from the two panel prototype and
every number in it is wrong. ENG-241 is open on either updating it or deleting
it. Delete it. Somebody will quote it at a vendor otherwise.

## Note on the material change

These runs are on Meniscus-C units. Polymer conducts less heat than glass, so
the outer panel runs slightly cooler at the skin and the stack underneath runs
slightly warmer. Measured difference on B11 was 0.6 C at the skin. It moves no
verdict in the table above.
