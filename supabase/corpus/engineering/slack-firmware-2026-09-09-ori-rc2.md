# #firmware — 9 September 2026

**11:02  Ben Achilov**
rc2 branch is cut. in it

- book to desk handoff double buffered, flash is 12ms instead of 90
- hinge reading clamped to 0-185, out of range falls back instead of laying out
- sensor dropout warning goes to the largest lit panel
- panel_half renamed to panel_split everywhere, including the three places the
  shell was still emitting panel_two

**11:04  Sam Lindqvist**
12ms is a different product

**11:05  Ben Achilov**
12ms is what it should have been in june

**11:06  Sam Lindqvist**
does the settle timer still need to be 180

**11:08  Ben Achilov**
probably not now, but i am not changing two things in the same rc. the timer is
an rc3 question

**11:09  Sam Lindqvist**
reasonable

**11:20  Jane Okonkwo**
this is the build the lab tests against, so nothing else goes in it. if you find
something on friday it goes in rc3 unless it stops the device booting

**11:21  Ben Achilov**
understood. i want b13 on it before i call it good though, b11 and b12 are rig
units and they have your test wiring on them

**11:23  Sam Lindqvist**
b13 is on my bench, bond passed. you can have it after i take the torque
baseline, so about 15:00

**11:24  Ben Achilov**
ok

**14:58  Ben Achilov**
one thing i did not expect. with the handoff fixed you can now see that the
panel 4 backlight comes up about 30ms behind the other three. it was hidden
inside the flash

**15:00  Sam Lindqvist**
that is a panel driver thing, not yours

**15:01  Ben Achilov**
i know whose it is. i am saying it is now visible, which it was not on friday

**15:03  Sam Lindqvist**
fixing one thing to reveal the next one down

**15:04  Ben Achilov**
every time

_reactions: 5 x white_check_mark_, 2 x eyes_
