# #firmware — 14 August 2026

**15:44  Ben Achilov**
writing down why the book to desk transition looks bad, because i keep
explaining it verbally and then nobody remembers

going from three panels to four means moving a live compositor surface across
the panel 4 boundary, which has its own refresh domain. today i stop
compositing, move it, and start again. that gap is the flash

**15:46  Sam Lindqvist**
how long is the gap

**15:46  Ben Achilov**
90ms on a good unit

**15:47  Sam Lindqvist**
that is very visible. the settle timer on that transition is 180 so a user is
looking at almost 300ms of nothing happening correctly

**15:48  Ben Achilov**
yes. i am aware. i am the one who wrote both numbers

**15:52  Ben Achilov**
the fix is double buffering across the domain and that wants memory i do not
have unless someone gives me back some of what the camera pipeline is holding

**15:53  Sam Lindqvist**
how much are you short

**15:53  Ben Achilov**
26

**15:54  Sam Lindqvist**
the camera pipeline is not mine to give away

**15:55  Ben Achilov**
it is not anyone's. it was allocated by a person who left in march and nobody
has touched the number since

**16:10  Jane Okonkwo**
take the 26 and see what breaks. if the camera owner complains, the camera
owner is you

**16:11  Ben Achilov**
the camera owner is me

**16:12  Ben Achilov**
i am going to complain anyway

_reactions: 5 x joy, 2 x eyes_
