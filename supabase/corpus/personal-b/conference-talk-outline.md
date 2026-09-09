# Talk outline, draft 3

Working title: The test you did not write

Property based testing, for people who have heard of it and bounced off it. 25
minutes plus 5 for questions. Draft 2 was 40 minutes of material pretending to be
25.

## Open, 3 min

The bug I shipped in 2019. Off by one in a date range that only appeared when the
range crossed a month boundary and the month had 31 days. Nine unit tests on that
function. All passing. All written by the same brain that wrote the bug.

That is the whole talk in one story. Do not explain the story. Tell it and move.

## Why example tests run out, 5 min

- You write the cases you thought of
- You thought of them while writing the code
- So the tests and the code share a blind spot
- Coverage percentage measures lines touched, not cases imagined

Resist the urge to be rude about coverage targets here. Draft 2 got smug and I
could hear it.

## Properties instead of examples, 6 min

Four kinds, one slide each, one line of code each:

1. Round trip. Encode then decode gives you back what you put in.
2. Invariant. Sorted output has the same elements as the input.
3. Comparison against something slow and obviously correct.
4. Idempotence. Doing it twice is the same as doing it once.

Do the round trip live. It is the one that clicks.

## Shrinking, 4 min

This is the part people do not know about and it is the part that makes the tool
worth using. Failure comes back as the smallest input that still fails, not the
random 400 character mess that found it.

## Where it does not help, 4 min

Be honest here or the whole talk reads like a sales pitch. It does not help when
you cannot state a property. It does not help with the code that is mostly
plumbing. It is slow enough that it does not belong on every commit. And the
generator is code, so the generator has bugs.

## Close, 3 min

Go and pick one function. One. The one where you already have six example tests
and a bad feeling.

## Slide 11

Still wrong. It is meant to show the generator narrowing a failing input across
successive runs, and every version I have drawn is either a table of numbers
nobody can read from row six of the room, or an animation that takes 40 seconds
to say a thing I can say out loud in eight.

Options: cut the slide and just say it. Draw one before and one after, no
in between steps. Or hand out the messy input as text on screen and cross bits
out live.

Probably cut it. I have said probably cut it in draft 2 as well and it is still
here.

## Timing note

Ran it at 31 minutes on the kitchen timer. The four kinds section is where it
goes. If I am at 12 minutes when I start section 3 I am fine. If I am at 15 I
drop the comparison one.
