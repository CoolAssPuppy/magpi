# #incidents — 31 August 2026

**13:31  Ben Achilov**
b11 shell went down on the rig. black on all four, backlights on. it was in desk
when it died, 13:26

**13:32  Sam Lindqvist**
b11 is on the cycle rig, it does not have a person to be in desk with

**13:33  Ben Achilov**
the rig cycles it through every state. it was at desk on the return leg

**13:33  Sam Lindqvist**
ok, fair

**13:35  Ben Achilov**
pulling the crash ring before anything restarts it. do not reflash it, do not
power cycle it

**13:36  Sam Lindqvist**
i am not touching your unit, i want my cycle count

**13:52  Ben Achilov**
segfault in the relayout path. hinge ring shows h3 going out of range for two
reads right before, 214 degrees, which is not a number a hinge can be

**13:54  Sam Lindqvist**
h3 on b11 is the one with the instrumented cable. the strain gauge shares the
flex

**13:55  Ben Achilov**
so your test wiring is producing an angle my shell believes

**13:56  Sam Lindqvist**
it should not be

**13:57  Ben Achilov**
and yet

**14:20  Ben Achilov**
two things. yours is to get the gauge off the hinge flex. mine is that ori should
reject a reading outside 0 to 185 instead of trying to lay out four panels around
a physically impossible angle. i have the sensor dropout path but not the
out of range path

**14:22  Sam Lindqvist**
how did we not have that

**14:23  Ben Achilov**
because until you built a unit that lies, nothing lied

**14:31  Ben Achilov**
clamping in rc2. shell restarted, unit is running, cycle count is whatever it was
plus the eleven minutes it was dead

**14:33  Sam Lindqvist**
9 cycles. i will note it

_reactions: 3 x eyes, 1 x white_check_mark_
