# Runbook: Ori shell crash on a dev unit

| | |
| --- | --- |
| Owner | Ben Achilov |
| Status | Active |
| Applies to | Dev units B9 and later, firmware 0.7.x |
| Last edited | 2026-09-05 |
| Tags | ori, firmware, runbook, incidents |

## When to use this

The shell has gone. Symptoms are a black display on every panel with the
backlight still on, panels that stay lit but stop responding to touch, or a
device that reboots into COVER and will not leave it.

> Do not reflash before you pull the logs. A reflash wipes the crash ring buffer
> and then all we have is your description of the colour of the screen.

## Steps

1. Note the time and the panel state the device was in when it died. Write it in
   the incident thread before you touch anything else.
2. Plug the unit into the bench host over USB C on the panel 4 port. The panel 1
   port is charge only on B9 and B10.
3. Run `ori-tool status`. If it answers, the shell is down and the firmware is
   alive. If it times out, go to step 7.
4. Pull the crash ring with `ori-tool dump --ring crash --out ./dump`. The ring
   holds the last 64 KB, so do this before anything restarts the shell.
5. Pull the hinge sensor log with `ori-tool dump --ring hinge --out ./dump`. Most
   shell crashes we have seen start with a sensor read that went out of range.
6. Restart the shell with `ori-tool shell restart`. If the device comes back,
   attach both dumps to the incident and stop here.
7. If `ori-tool status` timed out, hold the volume down and power buttons for 12
   seconds to force the recovery loader.
8. From recovery, run `ori-tool recover --dump ./dump`. This pulls whatever
   survived in the ring buffers without writing to the device.
9. Reflash with the last known good image from the firmware release page.
10. Cycle the device through COVER, PHONE, BOOK, DESK and back twice, and confirm
    each transition happens. A unit that boots but will not reach DESK is still
    broken.
11. File the incident with both dumps, the firmware version, the unit ID and the
    panel state from step 1.

## Common causes seen so far

| Symptom | Cause | Fix |
| --- | --- | --- |
| Black panels, backlight on | Shell segfault in the relayout path | Restart shell, file with dump |
| Stuck in COVER | H1 sensor reading out of range | Reseat the hinge flex on panel 1 |
| Reboot loop | Corrupt config after an interrupted flash | Reflash from recovery |
| Touch dead on panel 3 | Flex cable, mechanical | Hand to Sam, do not reflash |

**Who do I wake up?**
Nobody at night for a dev unit. Dev units are not customers. File it and pick it
up in the morning. If the unit is one of the cycle test units, tell Sam before
you reflash, because the firmware version is part of that test record.

**What if the unit is on the cycle rig?**
Stop the rig first and note the cycle count. A test unit that gets reflashed mid
run without the count recorded loses its place.
