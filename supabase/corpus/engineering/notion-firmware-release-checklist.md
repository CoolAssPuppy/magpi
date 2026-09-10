# Firmware release checklist

| | |
| --- | --- |
| Owner | Ben Achilov |
| Status | Active |
| Cadence | Every two weeks, Thursday |
| Last edited | 2026-09-07 |
| Tags | firmware, ori, process, checklist |

## Scope

Covers the 0.7.x dev builds that go onto lab units and the seven engineering
samples people carry. Production release process does not exist yet and will not
until we are through certification.

## Before the build

- [x] All ENG issues in the release milestone are closed or moved out
- [x] Hinge sensor calibration table matches the current Bellows revision
- [x] Panel state config file diffed against the state machine spec
- [ ] Changelog written in plain language, no issue numbers as the only entry
- [x] Version bumped in one place, `firmware/version.h`

## Build and smoke

1. Tag the commit as `fw-0.7.<n>`.
2. Build with `make release`. A build with local changes present is rejected by
   the script and that is deliberate.
3. Flash unit B9. This is the smoke unit and it stays on the bench.
4. Run the panel state sweep: COVER to PHONE to BOOK to DESK and back, twice,
   then LAPTOP and TENT once each.
5. Run `ori-tool selftest`. Every line has to come back green. A yellow line is
   a stop.
6. Leave the unit shut for 30 minutes and confirm it wakes to COVER with the
   notification list intact.
7. Charge from 20 to 40 percent and confirm no thermal warning fires.

## Rollout

| Group | Units | When |
| --- | --- | --- |
| Smoke | B9 | Build day |
| Lab | B10, B11, B12 | Build day plus one, if smoke is clean |
| Carry units | The seven engineering samples | Build day plus two |
| Cycle test units | B13 and up | Never automatically, ask Sam |

> Cycle test units do not take a firmware update as part of a rollout. The
> firmware version is part of the test record and changing it silently makes a
> 200,000 cycle run unciteable.

**What counts as a rollback?**
Any carry unit that hits a shell crash twice in a day, or any lab unit that
cannot reach DESK. Roll everyone back to the last tagged build and say so in
the firmware channel.

**Who signs off?**
Ben for the build. Sam if the release touches the hinge sensor calibration
table, because that table is shared with the mechanical spec.

## Release log

| Version | Date | Notes |
| --- | --- | --- |
| 0.7.4 | 2026-08-13 | Settle timers moved to config |
| 0.7.5 | 2026-08-27 | Hinge sensor recalibration for Bellows rev C.4 |
| 0.7.6 | 2026-09-03 | Crash ring buffer grown to 64 KB after the B10 incident |
| 0.7.7 | 2026-09-07 | Compatibility letterbox fix on DESK |
