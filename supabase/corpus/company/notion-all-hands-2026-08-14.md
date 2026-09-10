# All hands, 14 August 2026

| | |
| --- | --- |
| Notes by | Maya Restrepo |
| Chaired by | Jane Okonkwo |
| Attending | All seven |
| Date | 2026-08-14 |
| Last edited | 2026-08-14 |
| Tags | all-hands, notes, company |

Forty minutes, everyone on. Jane started by saying the next six weeks decide
whether the pilot line runs this year, and then spent the rest of the meeting
letting other people talk, which is the version of this meeting that works.

## Hardware

Sam has the outer layer material settled. UTG-3 ultra thin glass, picked on
Tuesday, sample lot request already out to the Kyoto vendor. The argument for it
is hardness, and the sample came back clean at 120,000 cycles with no haze
change and no delamination at the edge seal. Four units are going on the cycle
rig to take that number further.

Bellows rev C is close to a tooling revision. Torque curve is flat the way we
wanted, and the two detents feel right in the hand. Sam wants one more week
before he freezes it.

Ben asked whether the glass changes anything about panel geometry or refresh for
Ori. Sam said nothing changes, only the top layer is different. That answer got
written into the Linear issue afterwards so it stops being a conversation.

## Firmware

Ben walked through where Ori is. All six panel states exist and transition. The
settle timers moved out of constants and into config last build, which means
they can be tuned on a unit instead of rebuilt. LAPTOP has the longest timer at
400 milliseconds and Ben defended that at length: entering LAPTOP moves a
keyboard onto a panel under somebody's thumbs, and pulling it back out is the
worst thing the shell can do to a person.

TENT detection is still inferred from the accelerometer and it is still wrong on
a train. Nobody has a better idea yet.

## Supply chain

Dana has the pilot line slot held. Tooling commit is at the end of the month and
after that a material change costs six weeks and a new mask set. She asked
everyone to treat that date as real, because the line does not care about our
internal deadlines.

## Marketing

Maya has the positioning draft out for comment. The short version is that this
device is for people whose work does not fit on a phone, and that the four panel
surface is the argument. The folding is how it gets into a pocket. Priya is
building the messaging FAQ against it.

## Finance

John presented the spend picture to Jane separately. In the room he asked one
thing: tell him about a decision that moves money before it is made rather than
afterwards.

## Decisions

- Outer layer material is UTG-3 ultra thin glass. Sam owns it, decision record
  goes in Notion this week.
- Bellows rev C freezes next Friday unless the cycle rig says otherwise.
- Tooling commit date at the end of August is treated as fixed.

## Actions

- [x] Sam writes the outer layer decision record
- [x] Ben moves settle timers into config, done in 0.7.4
- [ ] Somebody finds a better TENT signal than the accelerometer
- [x] Maya circulates positioning for comment
- [x] Dana confirms the pilot line slot in writing
