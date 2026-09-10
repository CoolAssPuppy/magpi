# #firmware — 26 August 2026

**09:40  Ben Achilov**
b9 will not leave cover. opens all the way to desk physically, panels 2 3 4 stay
dark, panel 1 is fine

**09:42  Sam Lindqvist**
h1 flex again

**09:43  Ben Achilov**
that was going to be my guess but ori-tool status answers, so the firmware is
alive and the shell is alive. it is reading h1 at 4 degrees with the device flat
on the table

**09:44  Sam Lindqvist**
so the sensor, not the shell

**09:45  Ben Achilov**
so the sensor. reseating the flex

**10:02  Ben Achilov**
reseated. reads 178 flat. it was the connector, the retainer was not latched

**10:03  Sam Lindqvist**
b9 has had that connector open four times this month for the cycle instrumenting.
it is going to keep happening

**10:05  Ben Achilov**
then i want ori to say something instead of sitting in cover looking broken. right
now three bad reads gets you a shell warning that nobody sees because the shell
is on panel 1 and you are staring at the dark ones

**10:07  Sam Lindqvist**
put the warning on the panel the user is looking at

**10:08  Ben Achilov**
which panel is the user looking at, sam

**10:09  Sam Lindqvist**
the big dark one

**10:11  Ben Achilov**
ok that is actually right. if we fall back to cover after a sensor drop we should
light the largest panel with the warning rather than the state's default panel.
adding it to rc2

**10:14  Ben Achilov**
also adding it to the runbook so the next person does not spend twenty minutes
on it like i just did

_reactions: 2 x white_check_mark_, 1 x eyes_
