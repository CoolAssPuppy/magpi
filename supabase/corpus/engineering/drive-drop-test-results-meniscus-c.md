# Drop test, Meniscus-C units, round one

Sam Lindqvist
2026-09-03
Units B17, B18, B19, B20, built 2026-08-30 to 2026-09-01
Related: HW-114, ENG-212

## Why the numbering restarts

The two glass rounds are reference material now. The outer layer changed on 27
August and polymer takes and spreads an impact differently enough that carrying
the old pass rates forward would be dishonest. This is polymer round one. We
lost two rounds of drop history and I would make the same trade again.

## Method

Four units. Steel-backed concrete slab, no padding, drop height measured to the
lowest point of the device.

Primary height is 1.2 m, which is the plan height and roughly a phone leaving a
standing adult's hand. A stretch set at 1.5 m runs on two units after the
primary set completes, on the theory that the units are already spent.

Twenty-four drops per unit at 1.2 m: six faces, twelve edges, six corners. The
shut configuration takes the full set. The DESK configuration takes edges and
faces only, at 1.2 m, because the fixture cannot release a desk-sized device
flat above that height and because a person does not hold one at chest height.

After every drop: power on check, all four panels imaged, touch grid sweep,
torque on all three hinges at 90 degrees, panel gap at three points, and a
visual on the Meniscus outer layer under raking light.

A drop passes if the device powers on, all four panels display, touch responds
across the full grid, every hinge is inside 8 percent of nominal, and the outer
layer has no crack.

## Results

| Unit | Configuration | Height | Drops | Passes | Failures |
| --- | --- | --- | --- | --- | --- |
| B17 | shut | 1.2 m | 24 | 24 | 0 |
| B18 | shut | 1.2 m | 24 | 21 | 3 |
| B19 | DESK | 1.2 m | 18 | 15 | 3 |
| B20 | shut then DESK | 1.2 m | 24 | 22 | 2 |
| B18 | shut | 1.5 m | 6 | 4 | 2 |
| B20 | shut | 1.5 m | 6 | 3 | 3 |

Ninety drops at 1.2 m and twelve at 1.5 m.

## The failures

| Unit | Drop | Height | Impact | What happened |
| --- | --- | --- | --- | --- |
| B18 | 9 | 1.2 m | H2 edge, shut | Panel 3 cracked at the corner nearest H2. Device functional, crack invisible until you open it. |
| B18 | 14 | 1.2 m | H2 edge, shut, other end | Same crack, same corner, mirrored. |
| B18 | 19 | 1.2 m | corner, panel 4 lower | H3 torque 63.4 mNm against 70 nominal, 9.4 percent low, outside spec. |
| B19 | 6 | 1.2 m | H2 edge, DESK | Panel 3 touch dead in a 14 mm band along the fold. Display underneath intact. |
| B19 | 11 | 1.2 m | H2 edge, DESK | Same dead band, same width, other orientation. |
| B19 | 15 | 1.2 m | face, panels 2 and 3 flat | Two dead columns on panel 3. Device functional. |
| B20 | 8 | 1.2 m | H2 edge, shut | Panel 3 cracked, same corner as B18. |
| B20 | 17 | 1.2 m | corner, panel 4 lower | H3 torque 64.1 mNm, 8.4 percent low. |
| B18 | 1.5 m set | 1.5 m | corner, panel 1 | Frame deformation 0.6 mm, outer layer scuffed and uncracked. |
| B18 | 1.5 m set | 1.5 m | H2 edge | Panel 3 cracked. |
| B20 | 1.5 m set | 1.5 m | H2 edge, twice | Panel 3 cracked on the first, panel 2 cracked on the second. |

## What the results say

**The outer layer did not crack once.** A hundred and two drops, two heights,
two configurations, and Meniscus-C came through with scuffs. On glass round two
we had four cracks in seventy-eight drops. This is the material change doing
the thing it was chosen to do, and it is the only unambiguously good line in
this report.

**The H2 edge drop keeps cracking panel 3.** Three units, five events, always
the corner nearest H2. This is HW-114 and it is unchanged by the material,
because panel 3 is an inner panel and the outer layer has nothing to do with
it. The hinge edge is stiff and the panel frame behind it is not, so the energy
goes into the panel because the frame has nowhere else to put it. A user cannot
see this crack until they open the phone, which is worse rather than better.

The compliant layer fix is real. I added a 0.3 mm layer between the H2 bracket
and the panel 3 frame on a rebuilt B17 and ran six H2 edge drops at 1.2 m with
no cracks. Six drops is not a result. Two more drop lots would make it one, and
both need units we do not have until after the pilot build.

**H3 goes soft on a panel 4 corner impact.** Two units, same corner, torque
falling 8 to 9 percent below nominal and outside the spec band. H3 is the inner
hinge and takes the full moment when a shut device lands on that corner. A
hinge below the torque floor stops holding the device at an angle, which a user
notices inside a day and which shows up in a photograph of a phone that is
supposed to stand up on a desk.

## Actions

- H3 corner stiffener concept, me, by 11 September.
- Flex bond at the H2 fold, with the vendor. The dead touch band is a bond
  failure and the controller logs show channels going quiet rather than noisy,
  which points at the bond. No date, and it is the long pole.
- Two more H2 edge drop lots on the compliant layer, after the pilot build.
- B17 in its rebuilt state is the reference unit. It stays in the cabinet.
