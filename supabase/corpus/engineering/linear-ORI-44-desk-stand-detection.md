# ORI-44 · Detect the desk stand and switch to desk state

| | |
| --- | --- |
| Status | In Progress |
| Assignee | Ben Achilov |
| Labels | ori, accessories, state-machine |
| Project | Ori shell |
| Initiative | Ship the Fold S1 to carrier certification |
| Created | 2026-08-31 |
| Updated | 2026-09-05 |

## Description

Setting the device into the desk stand should put the shell into the desk state, laid out for a 656 mm surface at 12 degrees, without the user touching anything. Today the shell reads hinge angles only, so a fully opened device on a table and a fully opened device in the stand look identical to it.

Two parts. Detect the stand. Decide what detection means for the state machine.

Hardware proposal from Sam is a magnet in the stand and the existing hall sensor under panel 3, which we already have for the cover state. That sensor is placed for a magnet in the folded position, so its sensitivity in the open position has to be measured rather than assumed.

## Activity

**Ben Achilov** commented · 2026-09-01
> Bench numbers with a stand mockup and the production magnet. Seated, the sensor reads 4.1 mT. Threshold for the cover state is 2.8 mT. So we detect it comfortably, and that comfortable margin is the problem, because 2.8 mT is also reachable by things that are not our stand.

**Ben Achilov** commented · 2026-09-01
> Tried the obvious false triggers. A fridge magnet at 10 mm reads 3.4 mT. A car vent mount reads 6 mT and holds it. A laptop lid closure magnet reads 2.9 mT if you set the phone down next to a shut MacBook, which people do constantly. All three would put the shell into desk state on a device that is lying flat on a table.

**Sam Lindqvist** commented · 2026-09-02
> Then detection cannot be one magnet and one sensor. Add polarity. The stand magnet is oriented so the sensor sees a specific pole, and a random magnet has a 50 percent chance of being wrong.

**Ben Achilov** commented · 2026-09-02
> Fifty percent is not a filter, it is a coin. But it composes with the other signals, which is where this is going.

**Ben Achilov** commented · 2026-09-03
> Proposed gate. All four have to hold before we enter desk state from a stand.
>
> 1. All three hinge angles within 6 degrees of flat. A stand only holds the four panel state, so a device that is not flat is not in it.
> 2. Hall sensor above 2.8 mT with the expected polarity.
> 3. Accelerometer reads a stable 12 degrees from horizontal, plus or minus 4, held for 300 ms. A phone flat on a desk reads 0. A phone in a hand does not hold anything for 300 ms.
> 4. No touch contact on the rear during the window, which rules out being held.
>
> All four together get the false trigger rate on my desk to zero over an afternoon, including the shut MacBook, which fails on the accelerometer alone.

**Jane Okonkwo** commented · 2026-09-04
> How long does the whole gate take.

**Ben Achilov** commented · 2026-09-04
> 300 ms of it is the settle window and the rest is nothing. Measured seat to laid out at 340 ms average, worst case 390. Spec Sam wrote is 400 so we are inside it, but not by enough that I want to add a fifth condition.

**Sam Lindqvist** commented · 2026-09-05
> Magnet is in the stand drawing with the polarity called out and a note that it is a functional part and not a retention feature. If someone at the vendor flips it to make assembly easier, this all stops working and nobody will know why.

**Ben Achilov** commented · 2026-09-05
> Also adding an exit condition, because entering was the easy half. Leaving the stand drops the hall reading immediately but the hinges stay flat and the angle stays roughly right for as long as the user is lifting it. If I exit on the magnet alone the layout collapses while the device is still in the air, which looks like a crash. Exit is the magnet gone plus 250 ms plus any of touch, motion or an angle change over 8 degrees.
