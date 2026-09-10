# Ori panel state machine

| | |
| --- | --- |
| Owner | Ben Achilov |
| Status | Draft, mostly true |
| Last edited | 2026-08-13 |
| Tags | ori, firmware, spec |

## What Ori is

Ori is the shell and window manager. It decides what shows on how many panels.
Everything a user thinks of as "the phone knows I opened it" is Ori reading
hinge angles and picking a state.

## Panel states

| State | Panels active | Trigger | Typical use |
| --- | --- | --- | --- |
| COVER | 1 | Device shut | Notifications, camera, wallet |
| PHONE | 2 | H1 open past 150 degrees | Ordinary phone use |
| BOOK | 3 | H1 and H2 open | Reading, two app split |
| DESK | 4 | All three open past 150 degrees | Full surface, three app layout |
| LAPTOP | 2 plus 2 | H1 at D1, H2 and H3 flat | Keyboard on the lower half |
| TENT | 2 | H1 at D1, device inverted | Video, propped |

TODO: rename PANEL_HALF to PANEL_SPLIT everywhere. The shell still emits
PANEL_TWO in three places and the docs call it PANEL_HALF. This has been on the
list since the July rename and nobody has done it.

## Transitions

Ori transitions on hinge angle plus a settle timer. The timer exists because a
user moving the device through 90 degrees on the way to flat should not see a
LAPTOP layout flash for 200 milliseconds.

| From | To | Condition | Settle |
| --- | --- | --- | --- |
| COVER | PHONE | H1 over 150 | 120 ms |
| PHONE | BOOK | H2 over 150 | 180 ms |
| BOOK | DESK | H3 over 150 | 180 ms |
| PHONE | LAPTOP | H1 at D1 held | 400 ms |
| Any | COVER | All hinges under 15 | 80 ms |

> The settle timer on LAPTOP is long on purpose. Entering LAPTOP moves a
> keyboard onto a panel and pulling that back out from under a user's thumbs is
> the worst transition we have.

**What happens if a hinge sensor drops out?**
Ori falls back to the last known good state and raises a shell warning after
three consecutive bad reads. It does not guess. A device that guesses the panel
count relayouts every app under the user.

**Does the outer layer material change any of this?**
No. Ori reads hinge angles and panel geometry. The Meniscus material change on
27 August does not touch panel resolution, refresh or geometry, so the state
machine is unchanged. Confirmed with Sam on 28 August.

**What about apps that do not know about DESK?**
They get PHONE geometry centred on panel 2 with a letterbox. The compatibility
path has not changed since the A sample.

## Known gaps

- [ ] TENT detection is inferred from the accelerometer and it is wrong when the
      device is on a moving train
- [ ] No state for two panels open with the device flat on a desk, which is a
      real posture people use
- [x] Settle timers moved into config instead of constants
- [ ] Rename PANEL_HALF, see the TODO above
